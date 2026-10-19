"""Check the rendered production contract, not just individual YAML syntax."""
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
WEB = 'ghcr.io/kshyst/mermaid-web@sha256:' + 'a' * 64
API = 'ghcr.io/kshyst/mermaid-api@sha256:' + 'b' * 64


class ReleaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        result = subprocess.run(
            ['sh', str(ROOT / 'deploy/render-release.sh'), WEB, API],
            check=True, capture_output=True, text=True,
        )
        cls.resources = list(yaml.safe_load_all(result.stdout))
        cls.objects = {(r['kind'], r['metadata']['name']): r for r in cls.resources}

    def test_release_is_namespaced_and_uses_only_published_digests(self):
        self.assertTrue(self.resources)
        for resource in self.resources:
            self.assertEqual(resource['metadata']['namespace'], 'mermaid')
        images = [container['image'] for resource in self.resources
                  if resource['kind'] == 'Deployment'
                  for container in resource['spec']['template']['spec']['containers']]
        self.assertCountEqual(images, [WEB, API])

    def test_sqlite_is_single_writer_and_entire_data_directory_persists(self):
        deployment = self.objects['Deployment', 'diagrams-api']['spec']
        self.assertEqual(deployment['replicas'], 1)
        self.assertEqual(deployment['strategy'], {'type': 'Recreate'})
        pod = deployment['template']['spec']
        api = pod['containers'][0]
        mounts = {mount['name']: mount for mount in api['volumeMounts']}
        self.assertEqual(mounts['data']['mountPath'], '/data')
        claim = pod['volumes'][0]['persistentVolumeClaim']['claimName']
        storage = self.objects['PersistentVolumeClaim', claim]
        self.assertEqual(storage['spec']['storageClassName'], 'local-path')
        self.assertEqual(storage['metadata']['annotations']['argocd.argoproj.io/sync-options'],
                         'Prune=false,Delete=false')
        self.assertEqual(pod['securityContext']['fsGroup'], 10001)
        env = {item['name']: item['value'] for item in api['env']}
        self.assertEqual(env['JWT_SECRET_PATH'], '/data/jwt-secret')
        self.assertEqual(env['SECURE_COOKIES'], '1')

    def test_services_and_ingresses_reference_live_workloads(self):
        deployments = [r for r in self.resources if r['kind'] == 'Deployment']
        for service in [r for r in self.resources if r['kind'] == 'Service']:
            selector = service['spec']['selector']
            matching = [d for d in deployments if all(
                d['spec']['template']['metadata']['labels'].get(k) == v
                for k, v in selector.items())]
            self.assertEqual(len(matching), 1)
            container_ports = {p['name'] for c in matching[0]['spec']['template']['spec']['containers']
                               for p in c['ports']}
            for port in service['spec']['ports']:
                self.assertIn(port['targetPort'], container_ports)
        for ingress in [r for r in self.resources if r['kind'] == 'Ingress']:
            for rule in ingress['spec']['rules']:
                self.assertEqual(rule['host'], 'mermaid.kshyst.ir')
                for path in rule['http']['paths']:
                    backend = path['backend']['service']
                    service = self.objects['Service', backend['name']]
                    self.assertIn(backend['port']['number'], [p['port'] for p in service['spec']['ports']])
        secure = self.objects['Ingress', 'mermaid']
        self.assertEqual(secure['metadata']['annotations']['cert-manager.io/cluster-issuer'], 'letsencrypt')
        self.assertEqual(secure['spec']['tls'][0]['secretName'], 'mermaid-tls')

    def test_proxy_configmap_reference_is_resolved_and_api_stays_private(self):
        pod = self.objects['Deployment', 'mermaid-studio']['spec']['template']['spec']
        config_name = pod['volumes'][0]['configMap']['name']
        config = self.objects['ConfigMap', config_name]['data']['default.conf']
        self.assertIn('proxy_pass http://diagrams-api:8000', config)
        self.assertIn('proxy_set_header X-Forwarded-Proto $request_scheme', config)
        self.assertIn('set_real_ip_from 10.42.0.0/16', config)
        policy = self.objects['NetworkPolicy', 'api-from-frontend']['spec']
        self.assertEqual(policy['ingress'][0]['from'],
                         [{'podSelector': {'matchLabels': {'app': 'mermaid-studio'}}}])
        for resource in self.resources:
            if resource['kind'] != 'Deployment':
                continue
            spec = resource['spec']['template']['spec']
            self.assertFalse(spec['automountServiceAccountToken'])
            self.assertEqual(spec['nodeSelector']['kubernetes.io/hostname'], 'control-1')
            for container in spec['containers']:
                self.assertIn('requests', container['resources'])
                self.assertIn('limits', container['resources'])
                for probe in ('startupProbe', 'readinessProbe', 'livenessProbe'):
                    self.assertEqual(container[probe]['httpGet']['path'], '/healthz')

    def test_renderer_rejects_mutable_or_malformed_image_references(self):
        for invalid in ('ghcr.io/kshyst/web:latest', 'ghcr.io/kshyst/web@sha256:abc',
                        WEB + '\nresources: []', ''):
            result = subprocess.run(['sh', str(ROOT / 'deploy/render-release.sh'), invalid, API],
                                    capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(result.stdout, '')

    def test_argocd_reads_only_the_release_branch_and_cannot_manage_other_namespaces(self):
        application = yaml.safe_load((ROOT / 'deploy/argocd/application.yaml').read_text())['spec']
        self.assertEqual(application['source']['targetRevision'], 'deploy/production')
        self.assertEqual(application['source']['directory']['include'], 'manifests.yaml')
        self.assertEqual(application['destination']['namespace'], 'mermaid')
        self.assertTrue(application['syncPolicy']['automated']['selfHeal'])
        project = yaml.safe_load((ROOT / 'deploy/argocd/project.yaml').read_text())['spec']
        self.assertEqual(project['clusterResourceWhitelist'], [])
        self.assertEqual([d['namespace'] for d in project['destinations']], ['mermaid'])

    def test_ci_only_releases_main_after_tests_without_server_credentials(self):
        # BaseLoader keeps the YAML key "on" a string rather than a YAML 1.1 boolean.
        workflow = yaml.load((ROOT / '.github/workflows/deploy.yml').read_text(), Loader=yaml.BaseLoader)
        self.assertEqual(workflow['on']['push']['branches'], ['main'])
        publish = workflow['jobs']['publish']
        self.assertEqual(publish['needs'], 'test')
        self.assertIn("github.ref == 'refs/heads/main'", publish['if'])
        self.assertEqual(publish['concurrency']['cancel-in-progress'], 'false')
        for job in workflow['jobs'].values():
            for step in job['steps']:
                if 'uses' in step:
                    self.assertRegex(step['uses'], r'@[a-f0-9]{40}$')
        text = (ROOT / '.github/workflows/deploy.yml').read_text()
        self.assertNotIn('secrets.SSH', text)
        self.assertNotIn('secrets.KUBECONFIG', text)
        self.assertIn('git push origin HEAD:refs/heads/deploy/production', text)
        self.assertIn('"$current_main" != "$GITHUB_SHA"', text)
        self.assertNotIn('git push --force', text)

    def test_publication_creates_updates_and_does_not_regress_a_release(self):
        workflow = yaml.load((ROOT / '.github/workflows/deploy.yml').read_text(), Loader=yaml.BaseLoader)
        publish_script = workflow['jobs']['publish']['steps'][-1]['run']
        real_git = shutil.which('git')
        with tempfile.TemporaryDirectory(prefix='mermaid-publish-test-') as directory:
            root = Path(directory)
            source, remote, bin_dir = root / 'source', root / 'remote.git', root / 'bin'
            bin_dir.mkdir()

            def git(*args):
                return subprocess.check_output([real_git, *map(str, args)], text=True,
                                               stderr=subprocess.DEVNULL).strip()

            git('init', '--bare', remote)
            git('init', '-b', 'main', source)
            git('-C', source, 'config', 'user.name', 'Release Test')
            git('-C', source, 'config', 'user.email', 'release-test@example.invalid')
            git('-C', source, 'remote', 'add', 'origin', remote)

            def commit_main(content):
                (source / 'app.txt').write_text(content)
                git('-C', source, 'add', 'app.txt')
                git('-C', source, 'commit', '-m', content)
                git('-C', source, 'push', 'origin', 'main')
                return git('-C', source, 'rev-parse', 'HEAD')

            # Run the actual workflow shell, replacing only its remote URL.
            wrapper = bin_dir / 'git'
            wrapper.write_text('#!/bin/sh\n'
                               'if [ "$1" = remote ] && [ "$2" = add ] && [ "$3" = origin ]; then\n'
                               '  exec "$REAL_GIT" remote add origin "$FAKE_REMOTE"\n'
                               'fi\nexec "$REAL_GIT" "$@"\n')
            wrapper.chmod(0o755)

            def publish(revision, content):
                run_dir = root / ('run-' + str(len(list(root.glob('run-*')))))
                run_dir.mkdir()
                (run_dir / 'manifests.yaml').write_text(content)
                (run_dir / 'release.json').write_text(json.dumps({'source_revision': revision}))
                env = dict(os.environ, PATH=str(bin_dir) + os.pathsep + os.environ['PATH'],
                           REAL_GIT=real_git, FAKE_REMOTE=str(remote), GH_TOKEN='unused-local-test',
                           RUNNER_TEMP=str(run_dir), GITHUB_REPOSITORY='kshyst/mermaid',
                           GITHUB_SHA=revision, GITHUB_STEP_SUMMARY=str(run_dir / 'summary'))
                result = subprocess.run(['bash', '-c', publish_script], env=env,
                                        capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                return git('--git-dir', remote, 'rev-parse', 'refs/heads/deploy/production')

            first = commit_main('first source')
            initial_release = publish(first, 'first manifests\n')
            self.assertEqual(publish(first, 'first manifests\n'), initial_release)
            second = commit_main('second source')
            second_release = publish(second, 'second manifests\n')
            self.assertNotEqual(second_release, initial_release)
            self.assertEqual(publish(first, 'obsolete manifests\n'), second_release)
            self.assertEqual(git('--git-dir', remote, 'show',
                                 'deploy/production:manifests.yaml'), 'second manifests')
            self.assertEqual(git('--git-dir', remote, 'rev-parse', 'refs/heads/main'), second)


if __name__ == '__main__':
    unittest.main()
