import { useEffect, useState } from 'react';
import { Plus, Users, X } from 'lucide-react';
import { apiRequest } from './api';

export default function GroupsDialog({ user, groups, onRefresh, onClose }) {
  const [selected,setSelected] = useState(groups[0]?.id || ''), [members,setMembers] = useState([]), [name,setName] = useState(''), [memberName,setMemberName] = useState(''), [error,setError] = useState(''), [busy,setBusy] = useState(false), [renamed,setRenamed] = useState('');
  const group = groups.find(group => group.id===selected);
  const owner = group?.ownerId===user.id;
  async function loadMembers(id) { if (id) { const result=await apiRequest(`/api/groups/${id}/members`); setMembers(result.members); } else setMembers([]); }
  useEffect(() => { let current=true; setMembers([]); setRenamed(group?.name || ''); if(selected) apiRequest(`/api/groups/${selected}/members`).then(result => { if(current) setMembers(result.members); }).catch(error => { if(current) setError(error.message); }); return () => {current=false;}; }, [selected,group?.name]);
  async function perform(action) { setError('');setBusy(true);try { await action(); }catch(error){setError(error.message);}finally{setBusy(false);} }
  return <div className="modal-overlay" onMouseDown={event => { if(event.target===event.currentTarget) onClose(); }}><section className="modal groups-modal" role="dialog" aria-modal="true" aria-label="Manage groups">
    <button className="icon-button" title="Close groups" aria-label="Close groups" onClick={onClose}><X size={20}/></button>
    <div className="eyebrow">SHARED WORKSPACES</div><h2>Your groups</h2><p>Group members can view and edit diagrams assigned to the group.</p>
    <form className="group-inline-form" onSubmit={event => { event.preventDefault(); perform(async () => { const result=await apiRequest('/api/groups','POST',{name}); await onRefresh();setSelected(result.group.id);setName(''); }); }}><input aria-label="New group name" required maxLength={100} value={name} onChange={event => setName(event.target.value)} placeholder="New group name"/><button className="button primary" disabled={busy}><Plus size={14}/> Create group</button></form>
    {groups.length>0 && <label className="group-label">Group<select aria-label="Select group to manage" value={selected} onChange={event => setSelected(event.target.value)}><option value="">Choose a group</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name}{group.ownerId===user.id?' · Owner':''}</option>)}</select></label>}
    {group && <>
      {owner && <form className="group-inline-form" onSubmit={event => {event.preventDefault();perform(async () => {await apiRequest(`/api/groups/${selected}`,'PUT',{name:renamed});await onRefresh();});}}><input aria-label="Rename group" required maxLength={100} value={renamed} onChange={event => setRenamed(event.target.value)}/><button className="button secondary" disabled={busy}>Rename</button></form>}
      <div className="group-members-heading"><Users size={15}/> Members <span>{members.length}</span></div>
      <div className="group-members">{members.map(member => <div key={member.id}><span>{member.username}<small>{member.role==='owner'?'Group owner':'Member'}</small></span>{owner && member.id!==user.id && <button disabled={busy} onClick={() => perform(async () => {await apiRequest(`/api/groups/${selected}/members/${member.id}`,'DELETE');await loadMembers(selected);await onRefresh();})}>Remove</button>}</div>)}</div>
      {owner ? <form className="group-inline-form" onSubmit={event => {event.preventDefault();perform(async () => {await apiRequest(`/api/groups/${selected}/members`,'POST',{username:memberName});await loadMembers(selected);setMemberName('');});}}><input aria-label="Username to add" required minLength={3} maxLength={32} value={memberName} onChange={event => setMemberName(event.target.value)} placeholder="Registered user's username"/><button className="button primary" disabled={busy}>Add member</button></form> : <button className="button secondary" disabled={busy} onClick={() => perform(async () => {await apiRequest(`/api/groups/${selected}/leave`,'POST',{});await onRefresh();setSelected('');setMembers([]);})}>Leave group</button>}
    </>}
    {!groups.length && <p className="group-empty">Create your first group to share diagrams with other users.</p>}
    {error && <div className="account-error" role="alert">{error}</div>}
  </section></div>;
}
