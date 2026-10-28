import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function load(entry, overrides = {}, cache = new Map()) {
  const filename = path.resolve(root, entry);
  if (cache.has(filename)) return cache.get(filename);
  const loadedModule = { exports: {} };
  cache.set(filename, loadedModule.exports);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const resolve = (specifier) => {
    if (Object.hasOwn(overrides, specifier)) return overrides[specifier];
    if (specifier === 'server-only') return {};
    if (specifier === 'node:buffer') return { Buffer };
    const target = specifier.startsWith('@/') ? path.join(root, 'src', specifier.slice(2)) : path.resolve(path.dirname(filename), specifier);
    return load(path.relative(root, target + '.ts'), overrides, cache);
  };
  vm.runInNewContext('(function(require,module,exports){' + code + '\n})', { FormData, console, URL, Headers, process: { env: overrides.__env ?? {} } })(resolve, loadedModule, loadedModule.exports);
  cache.set(filename, loadedModule.exports);
  return loadedModule.exports;
}
function fixture({ role = 'protocol', active = true, user = true, queryError = false, configured = true, authError = false, expired = false, anonymous = false, confirmed = true, signOutError = false, signOutThrows = false, queryThrows = false, missingProfile = false, authThrows = false } = {}) {
  let signedOut = 0; let cleared = 0; const writable = [];
  const identity = { id: 'staff-1', email: 'test@example.com', email_confirmed_at: confirmed ? '2026-01-01T00:00:00Z' : null, is_anonymous: anonymous, user_metadata: { role: 'admin' } };
  const staff = { user_id: 'staff-1', full_name: 'Test Staff', role, is_active: active };
  const query = { select() { return this; }, eq(key, value) { assert.equal(key, 'user_id'); assert.equal(value, 'staff-1'); return this; }, async maybeSingle() { if (queryThrows) throw new Error('offline'); return { data: missingProfile ? null : staff, error: queryError ? new Error('denied') : null }; } };
  const client = {
    from(name) { assert.equal(name, 'staff_roles'); return query; },
    auth: {
      async getUser() { return { data: { user: user && !expired ? identity : null }, error: expired ? new Error('expired') : null }; },
      async signInWithPassword() { if (authThrows) throw new Error('offline'); return { data: { user: identity }, error: authError ? { status: 400 } : null }; },
      async signOut(options) { assert.equal(options.scope, 'local'); signedOut++; if (signOutThrows) throw new Error('offline'); return { error: signOutError ? new Error('offline') : null }; },
    },
  };
  const overrides = {
    '@/lib/supabase/server': { createClient: async (options = {}) => { writable.push(options.writable === true); return configured ? client : null; }, clearSessionCookies: async () => { cleared++; } },
    'next/navigation': { redirect(destination) { throw new Error('REDIRECT:' + destination); } },
  };
  return { overrides, staff, identity, client, writable, signedOut: () => signedOut, cleared: () => cleared };
}

function form(role = 'protocol', email = 'test@example.com', password = 'valid-password') {
  const data = new FormData(); data.set('role', role); data.set('email', email); data.set('password', password); return data;
}
test('validation rejects malformed email and empty password', () => {
  const { validateCredentials } = load('src/lib/auth/validation.ts');
  const result = validateCredentials('invalid', ''); assert.ok(result.email); assert.ok(result.password);
});
test('missing configuration blocks login without a fake session', async () => {
  const f = fixture({ configured: false });
  const result = await load('src/lib/auth/actions.ts', f.overrides).login(form()); assert.ok(result.error.includes('Supabase')); assert.equal(result.path, undefined);
});
test('tampered department is rejected', async () => {
  const f = fixture(); const result = await load('src/lib/auth/actions.ts', f.overrides).login(form('superadmin')); assert.ok(result.error); assert.equal(result.path, undefined);
});
test('correct password in wrong department is rejected and signed out', async () => {
  const f = fixture({ role: 'sales' }); const result = await load('src/lib/auth/actions.ts', f.overrides).login(form('admin')); assert.ok(result.error); assert.equal(result.path, undefined); assert.equal(f.signedOut(), 1);
});
for (const role of ['protocol', 'sales', 'admin']) test('verified ' + role + ' account receives only its own route', async () => {
  const f = fixture({ role }); const result = await load('src/lib/auth/actions.ts', f.overrides).login(form(role)); assert.equal(result.path, '/' + role);
});
test('disabled employee cannot log in', async () => {
  const f = fixture({ active: false }); const result = await load('src/lib/auth/actions.ts', f.overrides).login(form()); assert.ok(result.error); assert.equal(f.signedOut(), 1);
});
test('role lookup failure denies access', async () => {
  const f = fixture({ queryError: true }); const result = await load('src/lib/auth/actions.ts', f.overrides).login(form()); assert.ok(result.error); assert.equal(f.signedOut(), 1);
});
test('invalid credentials cannot produce a route', async () => {
  const f = fixture({ authError: true }); const result = await load('src/lib/auth/actions.ts', f.overrides).login(form()); assert.ok(result.error); assert.equal(result.path, undefined);
});
test('direct unauthenticated page access redirects', async () => {
  const f = fixture({ user: false }); await assert.rejects(load('src/lib/auth/authorization.ts', f.overrides).requireRole('admin'), /REDIRECT:.*session/);
});
test('direct access to another department redirects', async () => {
  const f = fixture({ role: 'sales' }); await assert.rejects(load('src/lib/auth/authorization.ts', f.overrides).requireRole('admin'), /REDIRECT:.*forbidden/);
});
test('role is re-read on subsequent requests after revocation', async () => {
  const f = fixture(); const { requireRole } = load('src/lib/auth/authorization.ts', f.overrides);
  assert.equal((await requireRole('protocol')).role, 'protocol'); f.staff.is_active = false;
  await assert.rejects(requireRole('protocol'), /REDIRECT:.*session/);
});
test('logout clears the current session before redirect', async () => {
  const f = fixture(); const result = await load('src/lib/auth/actions.ts', f.overrides).logout(); assert.equal(result.path, '/'); assert.equal(f.signedOut(), 1); assert.equal(f.cleared(), 1);
});

test('anonymous identities cannot enter a staff department', async () => {
  const f = fixture({ anonymous: true }); const result = await load('src/lib/auth/actions.ts', f.overrides).login(form()); assert.ok(result.error); assert.equal(f.cleared(), 1);
});
test('unconfirmed email cannot enter a staff department', async () => {
  const f = fixture({ confirmed: false }); const result = await load('src/lib/auth/actions.ts', f.overrides).login(form()); assert.ok(result.error); assert.equal(f.cleared(), 1);
});
test('a valid Auth account without a staff row is denied', async () => {
  const f = fixture({ missingProfile: true }); const result = await load('src/lib/auth/actions.ts', f.overrides).login(form()); assert.ok(result.error); assert.equal(result.path, undefined);
});
test('editable user_metadata cannot override the database role', async () => {
  const f = fixture({ role: 'sales' }); const result = await load('src/lib/auth/actions.ts', f.overrides).login(form('admin')); assert.ok(result.error); assert.equal(result.path, undefined);
});
test('an expired or invalid session cannot render a protected page', async () => {
  const f = fixture({ expired: true }); await assert.rejects(load('src/lib/auth/authorization.ts', f.overrides).requireRole('protocol'), /REDIRECT:.*session/);
});
test('a forged identity or mismatched staff user id fails closed', async () => {
  const f = fixture(); f.staff.user_id = 'another-user'; await assert.rejects(load('src/lib/auth/authorization.ts', f.overrides).requireRole('protocol'), /REDIRECT:.*session/);
});
test('changing the database role affects the next protected request', async () => {
  const f = fixture(); const guard = load('src/lib/auth/authorization.ts', f.overrides).requireRole; await guard('protocol'); f.staff.role = 'sales'; await assert.rejects(guard('protocol'), /REDIRECT:.*forbidden/); assert.equal((await guard('sales')).role, 'sales');
});
test('unknown database role cannot authorize a user', async () => {
  const f = fixture({ role: 'superadmin' }); const result = await load('src/lib/auth/actions.ts', f.overrides).login(form()); assert.ok(result.error);
});
test('network failure during role lookup clears the newly created session', async () => {
  const f = fixture({ queryThrows: true }); const result = await load('src/lib/auth/actions.ts', f.overrides).login(form()); assert.ok(result.error); assert.equal(f.cleared(), 1);
});
test('network failure during Auth never produces a route', async () => {
  const f = fixture({ authThrows: true }); const result = await load('src/lib/auth/actions.ts', f.overrides).login(form()); assert.ok(result.error); assert.equal(result.path, undefined); assert.equal(f.cleared(), 1);
});
for (const flag of ['signOutError', 'signOutThrows']) test('logout clears local cookies despite ' + flag, async () => {
  const f = fixture({ [flag]: true }); const result = await load('src/lib/auth/actions.ts', f.overrides).logout(); assert.equal(result.path, '/?notice=logout-unconfirmed'); assert.equal(f.cleared(), 1);
});
test('denied department still clears cookies if remote revocation fails', async () => {
  const f = fixture({ role: 'sales', signOutThrows: true }); const result = await load('src/lib/auth/actions.ts', f.overrides).login(form('admin')); assert.ok(result.error); assert.equal(result.path, undefined); assert.equal(f.cleared(), 1);
});
test('login explicitly uses a writable cookie client', async () => {
  const f = fixture(); await load('src/lib/auth/actions.ts', f.overrides).login(form()); assert.deepEqual(f.writable, [true]);
});
test('a missing configuration denies direct protected access', async () => {
  const f = fixture({ configured: false }); await assert.rejects(load('src/lib/auth/authorization.ts', f.overrides).requireRole('admin'), /REDIRECT:.*setup/);
});
test('binary form fields are rejected by server validation', async () => {
  const f = fixture(); const data = form(); data.set('email', new Blob(['not-an-email'])); const result = await load('src/lib/auth/actions.ts', f.overrides).login(data); assert.ok(result.fields.email); assert.equal(f.writable.length, 0);
});
function config(env) { return load('src/lib/supabase/config.ts', { __env: env }).getSupabaseConfig(); }
const baseEnv = { NEXT_PUBLIC_SUPABASE_URL: 'https://approved.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_testonly' };
test('publishable configuration is accepted without logging key material', () => { assert.equal(config(baseEnv).cookieName, 'sb-approved-auth-token'); });
test('secret API key is rejected in the public variable', () => { assert.equal(config({ ...baseEnv, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_forbidden' }), null); });
test('legacy service_role key is rejected while legacy anon is accepted', () => {
  const key = (role) => 'header.' + Buffer.from(JSON.stringify({ role })).toString('base64url') + '.signature';
  assert.equal(config({ ...baseEnv, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key('service_role') }), null);
  assert.ok(config({ ...baseEnv, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key('anon') }));
});
test('a mismatched project reference is rejected', () => { assert.equal(config({ ...baseEnv, SUPABASE_EXPECTED_PROJECT_REF: 'another-project' }), null); assert.ok(config({ ...baseEnv, SUPABASE_EXPECTED_PROJECT_REF: 'approved' })); });
test('remote plain HTTP, URL credentials and paths are rejected', () => {
  for (const url of ['http://approved.supabase.co', 'https://user:password@approved.supabase.co', 'https://approved.supabase.co/path', 'https://approved.supabase.co/?token=x']) assert.equal(config({ ...baseEnv, NEXT_PUBLIC_SUPABASE_URL: url }), null);
  assert.ok(config({ ...baseEnv, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' }));
});
test('session cookies are HttpOnly, SameSite Lax and Secure in production', () => {
  const { cookieOptions } = load('src/lib/supabase/config.ts', { __env: { NODE_ENV: 'production' } }); assert.equal(cookieOptions.httpOnly, true); assert.equal(cookieOptions.sameSite, 'lax'); assert.equal(cookieOptions.secure, true);
});
function cookieFixture() {
  const writes = []; let clientOptions;
  const names = ['sb-approved-auth-token', 'sb-approved-auth-token.0', 'sb-approved-auth-token.1', 'sb-approved-auth-token-code-verifier', 'sb-other-auth-token', 'unrelated', 'sb-approved-auth-token.bad'];
  const store = { getAll: () => names.map((name) => ({ name, value: 'synthetic' })), set: (name, value, options) => { writes.push({ name, value, options }); } };
  const overrides = {
    'next/headers': { cookies: async () => store },
    '@supabase/ssr': { createServerClient: (_url, _key, options) => { clientOptions = options; return {}; } },
    './config': { getSupabaseConfig: () => ({ url: 'https://approved.supabase.co', key: 'sb_publishable_testonly', cookieName: 'sb-approved-auth-token' }), cookieOptions: { path: '/', httpOnly: true, sameSite: 'lax' } },
  };
  return { writes, options: () => clientOptions, overrides, store };
}
test('cookie cleanup removes only this project session and chunks', async () => {
  const f = cookieFixture(); await load('src/lib/supabase/server.ts', f.overrides).clearSessionCookies(); assert.equal(f.writes.length, 4); assert.ok(f.writes.every((item) => item.options.maxAge === 0)); assert.ok(!f.writes.some((item) => item.name === 'sb-other-auth-token'));
});
test('Server Components leave cookie refresh to proxy', async () => {
  const f = cookieFixture(); await load('src/lib/supabase/server.ts', f.overrides).createClient(); f.options().cookies.setAll([{ name: 'token', value: 'x', options: {} }]); assert.equal(f.writes.length, 0);
});
test('Server Actions propagate cookie write errors instead of reporting success', async () => {
  const f = cookieFixture(); f.store.set = () => { throw new Error('write failed'); }; await load('src/lib/supabase/server.ts', f.overrides).createClient({ writable: true }); assert.throws(() => f.options().cookies.setAll([{ name: 'token', value: 'x', options: {} }]), /write failed/);
});

test('SSR proxy preserves every refreshed cookie and no-store headers across writes', async () => {
  let options;
  const requestCookies = new Map();
  function response() {
    const jar = new Map();
    return { headers: new Headers(), cookies: { getAll: () => [...jar.values()], set: (...args) => { const cookie = typeof args[0] === 'string' ? { name: args[0], value: args[1], ...args[2] } : args[0]; jar.set(cookie.name, cookie); } } };
  }
  const overrides = {
    '@supabase/ssr': { createServerClient: (_url, _key, value) => { options = value; return { auth: { getUser: async () => {
      options.cookies.setAll([{ name: 'chunk.0', value: 'fresh-0', options: { httpOnly: true } }], { 'Cache-Control': 'private' });
      options.cookies.setAll([{ name: 'chunk.1', value: 'fresh-1', options: { httpOnly: true } }]);
    } } }; } },
    'next/server': { NextResponse: { next: response } },
    '@/lib/supabase/config': { getSupabaseConfig: () => ({ url: 'https://approved.supabase.co', key: 'sb_publishable_testonly', cookieName: 'sb-approved-auth-token' }), cookieOptions: { httpOnly: true } },
  };
  const request = { cookies: { getAll: () => [...requestCookies].map(([name, value]) => ({ name, value })), set: (name, value) => requestCookies.set(name, value) } };
  const result = await load('src/proxy.ts', overrides).proxy(request);
  assert.equal(requestCookies.get('chunk.0'), 'fresh-0'); assert.equal(requestCookies.get('chunk.1'), 'fresh-1');
  assert.equal(result.cookies.getAll().length, 2); assert.match(result.headers.get('Cache-Control'), /no-store/);
});

for (const actual of ['protocol', 'sales', 'admin']) for (const requested of ['protocol', 'sales', 'admin']) {
  if (actual === requested) continue;
  test(actual + ' cannot log into or directly render ' + requested, async () => {
    const f = fixture({ role: actual });
    const result = await load('src/lib/auth/actions.ts', f.overrides).login(form(requested));
    assert.equal(result.path, undefined); assert.ok(result.error);
    await assert.rejects(load('src/lib/auth/authorization.ts', f.overrides).requireRole(requested), /REDIRECT:.*forbidden/);
  });
}
