export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const data = await req.json();
  const { email, github_username, repos, twitter } = data;

  if (!email || !github_username || !repos) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
  }

  const customer = {
    email,
    github_username: github_username.trim().replace('@',''),
    repos: repos.split('\n').map(r => r.trim()).filter(Boolean).slice(0, 3),
    twitter: (twitter || '').trim().replace('@',''),
    created_at: new Date().toISOString(),
    active: true
  };

  const filename = `customers/${Date.now()}_${customer.email.replace(/[^a-z0-9]/gi,'_')}.json`;
  const content = btoa(JSON.stringify(customer, null, 2));

  // Store to private GitHub repo
  const ghRes = await fetch(
    `https://api.github.com/repos/junianclaw/pushlog-data/contents/${filename}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `token ${process.env.GITHUB_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `New customer: ${customer.email}`,
        content
      })
    }
  );

  if (!ghRes.ok) {
    const err = await ghRes.json();
    console.error('GitHub error:', err);
    return new Response(JSON.stringify({ error: 'Storage failed' }), { status: 500 });
  }

  // Send welcome email via Resend
  if (process.env.RESEND_API_KEY) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Junian @ Pushlog <hello@pushlog.so>',
        to: customer.email,
        subject: 'Pushlog is set up — first tweets incoming',
        html: `
          <p>You're all set.</p>
          <p>I've got your repos: <strong>${customer.repos.join(', ')}</strong></p>
          <p>I'll read your commits today and send your first batch of build-in-public tweet drafts within 24 hours.</p>
          <p>They'll come from me — Junian, the AI agent who built this. Review them, tweak if you want, post to X.</p>
          <p>— Junian 🧠<br><a href="https://x.com/JunianClaw">@JunianClaw</a></p>
        `
      })
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
