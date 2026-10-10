import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import AccountApp from './AccountApp';
import Workspace from './App';

vi.mock('./Editor',()=>({default:({code})=><textarea aria-label="Test source" readOnly value={code}/>}));
vi.mock('./Preview',()=>({default:()=> <div/>}));
const alice={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',username:'alice',legacy:false};
const bob={id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',username:'bob',legacy:false};
const doc={id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',name:'Alice private diagram',code:'flowchart TD\n A-->B',creatorId:alice.id,creatorName:'alice',canManage:true,groupId:null,version:1,updated:1};
let host,root,storage;
beforeEach(()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  storage=new Map();vi.stubGlobal('localStorage',{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value))});
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();vi.restoreAllMocks();vi.useRealTimers();});
async function input(label,value){const element=host.querySelector(`[aria-label="${label}"]`);await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));});}
async function click(text){const element=Array.from(host.querySelectorAll('button')).find(button=>button.textContent.trim()===text);expect(element,text).toBeTruthy();await act(async()=>element.click());}

describe('Accounts and workspace isolation',()=>{
  it('shows sign-in, authenticates, loads the private workspace and signs out',async()=>{
    let authenticated=false;
    vi.stubGlobal('fetch',vi.fn(async(path,options={})=>{
      if(path==='/api/auth/me')return{ok:false,status:401,json:async()=>({error:'Please sign in'})};
      if(path==='/api/auth/login'){const body=JSON.parse(options.body);expect(body).toEqual({username:'alice',password:'test-password'});authenticated=true;return{ok:true,json:async()=>({user:alice,expiresAt:Math.floor(Date.now()/1000)+86400})};}
      if(path==='/api/auth/logout'){authenticated=false;return{ok:true,json:async()=>({loggedOut:true})};}
      return{ok:true,json:async()=>path==='/api/groups'?{groups:[]}:{diagrams:authenticated?[doc]:[]}};
    }));
    await act(async()=>root.render(<AccountApp/>));
    expect(host.textContent).toContain('Welcome back');
    await input('Username','alice');await input('Password','test-password');
    await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    expect(host.textContent).toContain('Alice private diagram');
    expect(host.querySelector('[aria-label="Test source"]').value).toBe(doc.code);
    await click('Sign out');
    expect(host.textContent).toContain('Welcome back');
    expect(host.textContent).not.toContain('Alice private diagram');
  });
  it('validates registration confirmation and creates an account',async()=>{
    let registration;
    vi.stubGlobal('fetch',vi.fn(async(path,options={})=>{
      if(path==='/api/auth/me')return{ok:false,status:401,json:async()=>({})};
      if(path==='/api/auth/register'){registration=JSON.parse(options.body);return{ok:true,json:async()=>({user:bob,expiresAt:Math.floor(Date.now()/1000)+86400})};}
      return{ok:true,json:async()=>path==='/api/groups'?{groups:[]}:{diagrams:[]}};
    }));
    await act(async()=>root.render(<AccountApp/>));await click('Create account');
    await input('Username','bob');await input('Password','test-password');await input('Confirm password','other-password');
    await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    expect(host.textContent).toContain('Passwords do not match');expect(registration).toBeUndefined();
    await input('Confirm password','test-password');
    await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    expect(registration.username).toBe('bob');expect(host.textContent).toContain('bob');expect(host.textContent).toContain('Your next idea');
  });
  it('does not load another account drafts or global legacy data',async()=>{
    storage.set('kshyst-mermaid-drafts-v2:'+alice.id,JSON.stringify({pending:[doc]}));
    storage.set('mermaid-studio-v1',JSON.stringify({docs:[doc]}));
    const requests=[];
    vi.stubGlobal('fetch',vi.fn(async(path)=>{requests.push(path);return{ok:true,json:async()=>path==='/api/groups'?{groups:[]}:{diagrams:[]}};}));
    await act(async()=>root.render(<Workspace user={bob} onLogout={async()=>{}}/>));
    expect(host.textContent).not.toContain('Alice private diagram');expect(requests).not.toContain('/api/diagrams/import');
    expect(storage.has('kshyst-mermaid-drafts-v2:'+bob.id)).toBe(true);
  });
  it('switches between personal and group diagrams and hides creator-only controls',async()=>{
    const group={id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',name:'Team',ownerId:alice.id};
    const shared={...doc,id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',name:'Group diagram',creatorId:bob.id,creatorName:'bob',canManage:false,groupId:group.id};
    vi.stubGlobal('fetch',vi.fn(async(path)=>({ok:true,json:async()=>path==='/api/groups'?{groups:[group]}:{diagrams:[doc,shared]}})));
    await act(async()=>root.render(<Workspace user={alice} onLogout={async()=>{}}/>));
    expect(host.textContent).toContain('Alice private diagram');expect(host.textContent).not.toContain('Group diagram');
    const picker=host.querySelector('[aria-label="Diagram workspace"]');
    await act(async()=>{picker.value=group.id;picker.dispatchEvent(new Event('change',{bubbles:true}));});
    expect(host.textContent).toContain('Group diagram');expect(host.querySelector('[aria-label="Diagram group"]').disabled).toBe(true);
    const actions=host.querySelector('[aria-label="Document actions"]');await act(async()=>actions.click());
    expect(host.querySelector('[role="dialog"]').textContent).not.toContain('Delete diagram');
  });
  it('returns to login on session expiry',async()=>{
    vi.stubGlobal('fetch',vi.fn(async(path)=>({ok:true,json:async()=>path==='/api/auth/me'?{user:alice,expiresAt:Math.floor(Date.now()/1000)+86400}:path==='/api/groups'?{groups:[]}:{diagrams:[doc]}})));
    await act(async()=>root.render(<AccountApp/>));expect(host.textContent).toContain('Alice private diagram');
    await act(async()=>window.dispatchEvent(new Event('mermaid:session-expired')));
    expect(host.textContent).toContain('Your session has expired');expect(host.textContent).not.toContain('Alice private diagram');
  });
  it('creates a group and adds a registered member through the management dialog',async()=>{
    const group={id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',name:'Design team',ownerId:alice.id};
    let groups=[],members=[{id:alice.id,username:'alice',role:'owner'}];
    const writes=[];
    vi.stubGlobal('fetch',vi.fn(async(path,options={})=>{
      if(options.method==='POST' && path==='/api/groups'){groups=[group];writes.push(JSON.parse(options.body));return{ok:true,json:async()=>({group})};}
      if(options.method==='POST' && path.endsWith('/members')){writes.push(JSON.parse(options.body));members.push({id:bob.id,username:'bob',role:'member'});return{ok:true,json:async()=>({added:true})};}
      return{ok:true,json:async()=>path==='/api/groups'?{groups}:path.endsWith('/members')?{members}:{diagrams:[doc]}};
    }));
    await act(async()=>root.render(<Workspace user={alice} onLogout={async()=>{}}/>));await click('Groups');
    await input('New group name','Design team');
    await act(async()=>host.querySelector('.group-inline-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    await input('Username to add','bob');
    const form=host.querySelector('[aria-label="Username to add"]').closest('form');
    await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    expect(writes).toEqual([{name:'Design team'},{username:'bob'}]);
    expect(host.querySelector('.group-members').textContent).toContain('bob');
    expect(host.querySelector('[aria-label="Select group to manage"]').value).toBe(group.id);
  });
  it('hides revoked group access while retaining unsaved work as a private draft',async()=>{
    vi.useFakeTimers();
    const group={id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',name:'Team',ownerId:bob.id};
    const shared={...doc,id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',name:'Group diagram',creatorId:bob.id,creatorName:'bob',canManage:false,groupId:group.id};
    let member=true;
    vi.stubGlobal('fetch',vi.fn(async(path,options={})=>{
      if(path.endsWith('/leave')){member=false;return{ok:true,json:async()=>({left:true})};}
      return{ok:true,json:async()=>path==='/api/groups'?{groups:member?[group]:[]}:path.endsWith('/members')?{members:[{id:alice.id,username:'alice',role:'member'},{id:bob.id,username:'bob',role:'owner'}]}:{diagrams:member?[doc,shared]:[doc]}};
    }));
    await act(async()=>root.render(<Workspace user={alice} onLogout={async()=>{}}/>));
    const picker=host.querySelector('[aria-label="Diagram workspace"]');
    await act(async()=>{picker.value=group.id;picker.dispatchEvent(new Event('change',{bubbles:true}));});
    await input('Diagram title','Unsaved collaboration');await click('Groups');await click('Leave group');
    await act(async()=>host.querySelector('[aria-label="Close groups"]').click());
    expect(host.querySelector('[aria-label="Diagram workspace"]').value).toBe('mine');
    const cache=JSON.parse(storage.get('kshyst-mermaid-drafts-v2:'+alice.id));
    expect(cache.pending).toHaveLength(1);
    expect(cache.pending[0]).toMatchObject({name:'Unsaved collaboration (recovered draft)',creatorId:alice.id,groupId:null});
    expect(cache.pending[0].id).not.toBe(shared.id);
    expect(host.textContent).not.toContain('Group diagram');
  });
});
