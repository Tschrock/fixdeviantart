const escape = (value: string) => value.replace('&', '&amp;').replace("'", '&apos;').replace('"', '&quot;').replace('<', '&lt;').replace('>', '&gt;')
const unescape = (value: string) => value.replace('&gt;', '>').replace('&lt;', '<').replace('&quot;', '"').replace('&apos;', "'").replace('&amp;', '&')

interface oEmbed {
  type: 'photo' | 'link' | 'video'
  title: string
  url: string
  fullsize_url?: string
  author_name: string
  provider_name: string
  thumbnail_url: string
  html?: string
}

export interface Env {
  DA_COOKIE: string;
}

function videoEmbedMeta(height: string | number, width: string | number, videoUrl: URL | string, type: string = "video/mp4") {
  return `
  <meta property="twitter:card" content="player"/>
  <meta property="twitter:player:height" content="${height}">
  <meta property="twitter:player:width" content="${width}">
  <meta property="twitter:player:stream" content="${escape(videoUrl.toString())}">
  <meta property="twitter:player:stream:content_type" content="${type}">

  <meta property="og:type" content="video">
  <meta property="og:video" content="${escape(videoUrl.toString())}">
  <meta property="og:video:secure_url" content="${escape(videoUrl.toString())}">
  <meta property="og:video:height" content="${height}">
  <meta property="og:video:width" content="${width}">
  <meta property="og:video:type" content="${type}">
`
}

function imageEmbedMeta(imageUrl: URL | string) {
  return `
  <meta property="twitter:card" content="summary_large_image">
  <meta property="twitter:image" content="${escape(imageUrl.toString())}">
  
  <meta property="og:image" content="${escape(imageUrl.toString())}">
`
}


function generateEmbedResponse(
  oEmbedUrl: URL | string,
  originalUrl: URL | string,
  title: string,
  description: string,
  imageUrl?: URL | string
) {
  return new Response(`<!DOCTYPE html>
  <html>
  <head>

    <!-- oEmbed -->
    <link type="application/json+oembed" href="${escape(oEmbedUrl.toString())}" />
  
    <!-- OpenGraph -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="${escape(originalUrl.toString())}">
    <meta property="og:title" content="${escape(title)}">
    <meta property="og:description" content="${escape(description)}">
    <meta property="og:site_name" content="fixdeviantart.com">
    ${imageUrl ? `<meta property="og:image" content="${escape(imageUrl.toString())}">` : ''}
    
    <!-- Twitter Card -->
    <meta name="twitter:site" content="@deviantart">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escape(title)}" />
    <meta name="twitter:description" content="${escape(description)}" />
    ${imageUrl ? `<meta name="twitter:image" content="${escape(imageUrl.toString())}" />` : ''}
  
    <!-- Redirect real clients -->
    <meta http-equiv="refresh" content="0; url=${escape(originalUrl.toString())}" />
  
  </head>
  <body>
    Redirecting...<br>
    <a href="${escape(originalUrl.toString())}">Click here if your browser broke.</a>
  </body>
  </html>`, {
    status: 200,
    statusText: 'OK',
    headers: { 'Content-Type': 'text/html; charset=UTF-8' }
  });
}

interface VideoSource {
  label: string
  src: string
  width: number
  height: number
}

async function getVideoSourceFromEmbedHtml(embedHtml: string): VideoSource | null {
  // Extract the video embed page URL
  const embedPageMatch = embedHtml.match(/src="([^"]+)"/)
  if (!embedPageMatch) return null
  const embedPageUrl = new URL(embedPageMatch[1])

  // Fetch the video embed page
  const embedPageResponse = await fetch(embedPageUrl.toString())
  if (!embedPageResponse.ok) return null
  const embedPageHtml = await embedPageResponse.text()

  // Extract the video sources from the gmon-sources attribute
  const sourcesMatch = embedPageHtml.match(/gmon-sources="([^"]+)"/)
  if (!sourcesMatch) return null
  let sources: Record<string, VideoSource>
  try {
    sources = JSON.parse(unescape(sourcesMatch[1]))
  } catch (e) {
    return null
  }

  // Find the highest quality video source
  let highestQualitySource: VideoSource | null = null
  for (const source of Object.values(sources)) {
    if (!highestQualitySource || source.width > highestQualitySource.width) {
      highestQualitySource = source
    }
  }

  return highestQualitySource
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // If linking to homepage, redirect to the project page
    if (url.pathname === '/') {
      return new Response(null, {
        status: 301,
        headers: {
          'Location': 'https://github.com/Tschrock/fixdeviantart'
        }
      })
    }

    // Fix the hostname (replace the second level domain with deviantart)
    const hostnameParts = url.hostname.split('.')
    if (hostnameParts.length >= 2) hostnameParts[hostnameParts.length - 2] = 'deviantart'
    url.hostname = hostnameParts.join('.')

    // Build the oEmbed URL
    const embedUrl = new URL('https://backend.deviantart.com/oembed')
    embedUrl.searchParams.set('url', url.toString())
    embedUrl.searchParams.set('format', 'json')

    // Fetch the oEmbed data
    const cookies: Record<string, string> = JSON.parse(env.DA_COOKIE)
    const embedResponse = await fetch(embedUrl.toString(), {
      headers: {
        'Cookie': Object.entries(cookies).map(([key, value]) => `${key}=${value}`).join('; ')
      }
    })

    if (embedResponse.ok) {
      // Parse the oEmbed data
      const data = await embedResponse.json<oEmbed>()

      if (data.type === 'photo') {
        // Deviation is an image
        return generateEmbedResponse(embedUrl, url, data.title, data.author_name, data.url)
      } else if (data.type === 'link') {
        // Deviation is an animation/flash file
        return generateEmbedResponse(embedUrl, url, data.title, data.author_name, data.fullsize_url)
      } else if (data.type === 'video') {
        // Deviation is a video, we need to extract the mp4 URL
        if (data.html) {
          const videoSource = await getVideoSourceFromEmbedHtml(data.html)
          if (videoSource) {
            return generateEmbedResponse(embedUrl, url, data.title, data.author_name, videoSource.src)
          }
        }

        // Couldn't find embed video, fallback to thumbnail
        return generateEmbedResponse(embedUrl, url, data.title, data.author_name, data.url)
      }
    } else {

      // Handle known error cases
      if (DEVIATION_DOESNT_EXIST.test(embedResponse.statusText)) {
        return generateEmbedResponse(embedUrl, url, "Deviation Not Found", "The deviation you are trying to view does not exist.")
      }

      if (DEVIATION_IS_PRIVATE.test(embedResponse.statusText)) {
        let title = "Deviation is Private"
        let description = "The deviation you are trying to view is private."
        return generateEmbedResponse(embedUrl, url, title, description, url)
      }

      if (URL_INVALID.test(embedResponse.statusText)) {
        let title = "Invalid URL"
        let description = "The URL you are trying to view is not a deviation URL."
        return generateEmbedResponse(embedUrl, url, title, description, url)
      }

      let title = "Oops, something went wrong"
      let description = `Yell at @CyberPon3 to fix this\nStatus: ${embedResponse.status} ${embedResponse.statusText}\nResponse: ${await embedResponse.text()}`
      console.error(new Error(`Failed to fetch ${embedUrl.toString()}: ${description}`))
      return generateEmbedResponse(embedUrl, url, title, description, url)
    }
  },
}


const NOT_FOUND = /^404 Not Found/
const DEVIATION_DOESNT_EXIST = /Deviation id not found$/
const DEVIATION_IS_PRIVATE = /Deviation id [0-9]+ is private$/
const URL_INVALID = /The URL .+ is not a deviation URL$/
