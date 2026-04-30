import Document, {Html, Head, Main, NextScript} from 'next/document'

const isDevelopment = process.env.NODE_ENV !== 'production'

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "form-action 'none'",
  "frame-src 'self'",
  "img-src 'self' data: blob: http: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  `script-src 'self'${isDevelopment ? " 'unsafe-eval'" : ''}`,
  `connect-src 'self' http://127.0.0.1:* http://localhost:* https://api.idena.io https://raw.githubusercontent.com${
    isDevelopment ? ' ws://127.0.0.1:* ws://localhost:*' : ''
  }`,
].join('; ')

class MyDocument extends Document {
  render() {
    return (
      <Html>
        <Head>
          <meta
            httpEquiv="Content-Security-Policy"
            content={contentSecurityPolicy}
          />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}

export default MyDocument
