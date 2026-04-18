// Cloudflare Worker — Decap CMS GitHub OAuth proxy
// 環境変数 GITHUB_CLIENT_ID と GITHUB_CLIENT_SECRET を Worker の Settings で設定してください

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        },
      });
    }

    // Step 1: CMS → GitHub へリダイレクト
    if (url.pathname === '/auth') {
      const redirectUri = `${url.origin}/callback`;
      const githubUrl = new URL('https://github.com/login/oauth/authorize');
      githubUrl.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
      githubUrl.searchParams.set('redirect_uri', redirectUri);
      githubUrl.searchParams.set('scope', 'repo,user');
      return Response.redirect(githubUrl.toString(), 302);
    }

    // Step 2: GitHub からのコールバック → トークン取得 → CMS へ返す
    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code');
      if (!code) return new Response('Missing code', { status: 400 });

      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
        }),
      });

      const data = await tokenRes.json();

      if (data.error || !data.access_token) {
        return new Response(`GitHub OAuth error: ${data.error_description || data.error}`, { status: 400 });
      }

      const successMessage = JSON.stringify(
        `authorization:github:success:${JSON.stringify({ token: data.access_token, provider: 'github' })}`
      );

      const html = `<!DOCTYPE html>
<html>
<body>
<script>
(function () {
  var msg = ${successMessage};
  function receive(e) {
    window.opener.postMessage(msg, e.origin);
  }
  window.addEventListener('message', receive, false);
  window.opener.postMessage('authorizing:github', '*');
})();
</script>
</body>
</html>`;

      return new Response(html, {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};
