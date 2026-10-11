# HTTPS deployment

Production hostname: `mermaid.kshyst.ir`.

The host Nginx terminates TLS on port 443 using the configuration in
`mermaid.nginx.conf`. Docker publishes the frontend only on
`127.0.0.1:3010`; access it through the host proxy in production. Local access
remains available at `http://localhost:3010`.

The initial Let’s Encrypt certificate was issued using DNS-01. Renewal uses
HTTP-01 through `/var/www/letsencrypt`, with the host certbot.timer enabled.
Keep the domain A record pointing to the host and port 80 reachable.
Certificates and private keys remain under `/etc/letsencrypt` on the server.

Install the host configuration after obtaining the certificate:

```sh
sudo install -d /var/www/letsencrypt
sudo install -m 644 deploy/mermaid.nginx.conf /etc/nginx/sites-enabled/mermaid
sudo nginx -t && sudo systemctl reload nginx
sudo certbot reconfigure --cert-name mermaid.kshyst.ir --webroot --preferred-challenges http \
  --webroot-path /var/www/letsencrypt --deploy-hook "systemctl reload nginx" \
  --non-interactive
sudo systemctl enable --now certbot.timer
```

The host proxy sets HTTPS explicitly; the inner proxy preserves it so API
origin checks and Secure authentication cookies use the public scheme.
Do not expose port 3010 publicly when trusting forwarded scheme headers.
