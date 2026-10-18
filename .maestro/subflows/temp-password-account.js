// Maestro runScript (GraalJS, Maestro's `http` and `json`): makes a throwaway account in
// Avery Household and has the superuser issue it a temporary password, the way an admin
// does from the web app's Users page (the mobile app can't issue one).
// Needs AUTH_URL (jarvisd's auth API as the host sees it), EMAIL and PASSWORD (the
// superuser). Sets output.tempEmail and output.tempPassword.
function call(method, path, body, token) {
  var headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  var opts = { headers: headers };
  if (body) opts.body = JSON.stringify(body);
  var res = method === 'GET' ? http.get(AUTH_URL + path, opts) : http.post(AUTH_URL + path, opts);
  if (res.status < 200 || res.status > 299) {
    throw new Error(method + ' ' + path + ': ' + res.status + ' ' + res.body);
  }
  return json(res.body);
}

var admin = call('POST', '/auth/login', { email: EMAIL, password: PASSWORD }).access_token;
var households = call('GET', '/households', null, admin);
var avery = households.filter(function (h) { return h.name === 'Avery Household'; })[0] || households[0];
var invite = call('POST', '/households/' + avery.id + '/invites',
  { default_role: 'member', max_uses: 1, expires_in_days: 1 }, admin);

var email = 'e2e-temp-' + Date.now() + '@jarvisautomation.io';
var made = call('POST', '/auth/register',
  { email: email, password: PASSWORD, invite_code: invite.code });
var temp = call('POST', '/superuser/users/' + made.user.id + '/temp-password', {}, admin);

output.tempEmail = email;
output.tempPassword = temp.temp_password;
