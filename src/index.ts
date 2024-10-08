function escape(value: string) {
  return value.replace('&', '&amp;').replace("'", '&apos;').replace('"', '&quot;').replace('<', '&lt;').replace('>', '&gt;')
}

interface oEmbed {
  title: string
  url: string
  author_name: string
  provider_name: string
  fullsize_url?: string | undefined
}

export interface Env {
  DA_COOKIE: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    url.hostname = url.hostname.replace("fixdeviantart.com", "deviantart.com")

    const embedUrl = new URL('https://backend.deviantart.com/oembed')
    embedUrl.searchParams.set('url', url.toString())

    const cookies: Record<string, string> = JSON.parse(env.DA_COOKIE)

    const embedResponse = await fetch(embedUrl.toString(), {
      headers: {
        'Cookie': Object.entries(cookies).map(([key, value]) => `${key}=${value}`).join('; ')
      }
    })

    if (embedResponse.ok) {
      const data = await embedResponse.json<oEmbed>()
      return new Response(`<!DOCTYPE html>
<html>
<head>

  <!-- oEmbed -->
  <link type="application/json+oembed" href="${escape(embedUrl.toString())}" />

  <!-- OpenGraph -->
  <meta property="og:title" content="${escape(data.title)}">
  <meta property="og:site_name" content="${escape(data.provider_name)}">
  <meta property="og:image" content="${escape(data.fullsize_url ?? data.url)}">
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escape(data.title)}" />
  <meta name="twitter:image" content="${escape(data.fullsize_url ?? data.url)}" />

  <!-- Redirect real clients -->
  <meta http-equiv="refresh" content="0; url=${escape(url.toString())}" />

</head>
<body>
  Redirecting...<br>
  <a href="${escape(url.toString())}">Click here if your browser broke.</a>
</body>
</html>`, {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': 'text/html; charset=UTF-8'
        }
      })
    } else {
      let title = "Oops, something went wrong"
      let description = `Yell at @CyberPon3 to fix this\nStatus: ${embedResponse.status} ${embedResponse.statusText}\nResponse: ${await embedResponse.text()}`
      console.error(new Error(`Failed to fetch ${embedUrl.toString()}: ${description}`))
      return new Response(`<!DOCTYPE html>
<html>
<head>

  <!-- OpenGraph -->
  <meta property="og:title" content="${escape(title)}">
  <meta property="og:description" content="${escape(description)}">
  <meta property="og:site_name" content="fixdeviantart.com">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="Oops, something went wrong" />
  <meta name="twitter:description" content="${escape(description)}" />
  <meta name="twitter:creator" content="@CyberPon3" />

  <!-- Redirect real clients -->
  <meta http-equiv="refresh" content="0; url=${escape(url.toString())}" />

</head>
<body>
  Redirecting...<br>
  <a href="${escape(url.toString())}">Click here if your browser broke.</a>
</body>
</html>`, {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': 'text/html; charset=UTF-8'
        }
      })
    }
  },
}
