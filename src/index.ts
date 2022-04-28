function escape(value: string) {
  return value.replace('&', '&amp;').replace("'", '&apos;').replace('"', '&quot;').replace('<', '&lt;').replace('>', '&gt;')
}

interface oEmbed {
  title: string
  url: string
  author_name: string
  provider_name: string
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    url.hostname = url.hostname.replace("fixdeviantart.com", "deviantart.com")

    const embedUrl = new URL('https://backend.deviantart.com/oembed')
    embedUrl.searchParams.set('url', url.toString())

    const embedResponse = await fetch(embedUrl.toString())

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
  <meta property="og:image" content="${escape(data.url)}">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escape(data.title)}" />
  <meta name="twitter:image" content="${escape(data.url)}" />

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
      return new Response(null, {
        status: 301,
        statusText: 'Moved Permanently',
        headers: {
          'Location': url.toString()
        }
      })
    }
  },
}
