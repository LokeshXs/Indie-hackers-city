import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
import { createClient } from '@supabase/supabase-js';
loadEnvConfig(process.cwd(), true);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('Supabase is not configured');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const clients = [createClient(url, key, options), createClient(url, key, options)];
const topic = `cafe-smoke:${crypto.randomUUID()}`;
const channels = clients.map(client => client.channel(topic));
function awaitState(channel, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { clearInterval(poll); reject(new Error('Presence sync timed out')); }, 12000);
    const poll = setInterval(() => { if (predicate(Object.values(channel.presenceState()).flat())) { clearInterval(poll); clearTimeout(timer); resolve(); } }, 100);
  });
}
try {
  await Promise.all(channels.map(channel => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Subscription timed out')), 12000);
    channel.on('presence', { event: 'sync' }, () => {}).subscribe(status => {
      if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(timer); reject(new Error(`Subscription ${status}`)); }
    });
  })));
  if (await channels[0].track({ userId: 'smoke-only', intention: 'initial' }) !== 'ok') throw new Error('Track failed');
  await awaitState(channels[1], state => state.some(p => p.intention === 'initial'));
  if (await channels[0].track({ userId: 'smoke-only', intention: 'updated' }) !== 'ok') throw new Error('Update failed');
  await awaitState(channels[1], state => state.some(p => p.intention === 'updated'));
  await channels[0].untrack();
  await awaitState(channels[1], state => state.length === 0);
  console.log('PASS: two clients received join, intention update, and leave on an isolated channel.');
} catch (error) {
  console.error(error.message); process.exitCode = 1;
} finally {
  await Promise.all(clients.map(client => client.removeAllChannels()));
}
