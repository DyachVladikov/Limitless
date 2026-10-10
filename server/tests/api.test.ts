import test from 'node:test';
import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import { createTestDatabase, inTransaction } from './helpers';
import { createHandler } from '../api/router';

test('HTTP API: owner-only empty database, explicit setup, camelCase and exact-once focus', async () => {
  process.env.APP_ORIGINS = 'http://localhost:5173';
  process.env.SESSION_SECRET = 'test-session-secret-'.repeat(3);
  process.env.CRON_SECRET = 'test-cron-secret-'.repeat(3);
  const password = 'owner-test-password';
  const salt = Buffer.alloc(32, 2);
  process.env.OWNER_PASSWORD_HASH = `scrypt:32768:8:1:${salt.toString('hex')}:${scryptSync(password,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024}).toString('hex')}`;
  const db = await createTestDatabase();
  let cookie = '';
  const api = createHandler({ runTransaction: run => inTransaction(db,run), now: () => '2026-10-10T09:00:00.000Z' });
  const call = (path:string,method='GET',body?:unknown,extra:Record<string,string>={}) => api(new Request(`http://localhost:8080/api${path}`,{
    method, headers:{Origin:'http://localhost:5173','X-Requested-With':'Limitless','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...extra},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
  }));
  try {
    assert.equal((await call('/health')).status,200);
    assert.equal((await call('/profile')).status,401);
    const login=await call('/auth/login','POST',{password});
    assert.equal(login.status,200);
    cookie=login.headers.get('set-cookie')!.split(';')[0];
    assert.equal((await call('/profile')).status,404);
    assert.equal((await db.query('SELECT count(*) FROM profiles')).rows[0].count,0);
    const created=await call('/profile','POST',{name:'Owner'});
    assert.equal(created.status,201,await created.clone().text());
    const setup=await created.json();
    assert.equal(setup.profile.rank,'E');
    assert.equal(setup.profile.totalExp,0);
    assert.equal(typeof setup.profile.version,'string');
    assert.equal(setup.meta.gameDate,'2026-10-10');
    for(const table of ['tasks','quests','dishes','books','mentors']) assert.equal(Number((await db.query(`SELECT count(*) FROM ${table}`)).rows[0].count),0);
    assert.equal((await call('/profile','POST',{name:'Second'})).status,409);
    const tasks=await (await call('/tasks/today')).json();
    assert.deepEqual(tasks.data.tasks,[]);
    const body={id:'00000000-0000-4000-8000-000000000001',durationSeconds:600};
    const focus=await call('/focus','POST',body);
    assert.equal(focus.status,201,await focus.clone().text());
    const saved=await focus.json();
    assert.equal(saved.data.awardedXp,2);
    const repeat=await(await call('/focus','POST',body)).json();
    assert.equal(repeat.profile.totalExp,saved.profile.totalExp);
    assert.equal((await call('/focus','POST',{...body,durationSeconds:700})).status,409);
    assert.equal((await call('/profile','PATCH',{version:repeat.profile.version,totalExp:100000})).status,400);
    assert.equal((await call('/profile','DELETE')).status,405);
    assert.equal((await call('/daily-logs')).status,404);
    assert.equal((await call('/books/%ZZ')).status,400);
    assert.equal((await call('/jobs/rollover','POST',{})).status,401);
    const job=await api(new Request('http://localhost:8080/api/jobs/rollover',{method:'POST',headers:{Authorization:`Bearer ${process.env.CRON_SECRET}`}}));
    assert.equal(job.status,200,await job.clone().text());
    const jobWithSlash=await api(new Request('http://localhost:8080/api/jobs/rollover/',{method:'POST',headers:{Authorization:`Bearer ${process.env.CRON_SECRET}`}}));
    assert.equal(jobWithSlash.status,200);
    assert.equal((await call('/auth/logout','POST')).status,200);
  } finally { await db.close(); }
});
