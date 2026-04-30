#!/usr/bin/env node

const {spawnSync} = require('child_process')
const fs = require('fs')
const path = require('path')

const projectRoot = path.join(__dirname, '..')

const nextBin = path.join(
  __dirname,
  '..',
  'node_modules',
  'next',
  'dist',
  'bin',
  'next'
)

const baseNodeOptions = process.env.NODE_OPTIONS || ''
const needsLegacyProvider =
  Number.parseInt(process.versions.node.split('.')[0], 10) >= 17 &&
  !baseNodeOptions.includes('--openssl-legacy-provider')

const env = {
  ...process.env,
  BROWSERSLIST_IGNORE_OLD_DATA: '1',
  NODE_OPTIONS: needsLegacyProvider
    ? `${baseNodeOptions} --openssl-legacy-provider`.trim()
    : baseNodeOptions,
}

function runNext(args) {
  const result = spawnSync(process.execPath, [nextBin, ...args], {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
  })

  if (result.error) {
    console.error(`next ${args.join(' ')} failed: ${result.error.message}`)
    process.exit(1)
  }

  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
}

function cleanRendererBuildOutput() {
  ;['renderer/.next', 'renderer/out'].forEach((relativePath) => {
    fs.rmSync(path.join(projectRoot, relativePath), {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    })
  })
}

function listHtmlFiles(dirPath) {
  return fs.readdirSync(dirPath, {withFileTypes: true}).flatMap((entry) => {
    const entryPath = path.join(dirPath, entry.name)

    if (entry.isDirectory()) {
      return listHtmlFiles(entryPath)
    }

    return entry.isFile() && entry.name.endsWith('.html') ? [entryPath] : []
  })
}

function htmlAssetPrefix(outDir, htmlFilePath) {
  const relativeRoot = path.relative(path.dirname(htmlFilePath), outDir)

  if (!relativeRoot) {
    return './'
  }

  return `${relativeRoot.split(path.sep).join('/')}/`
}

function rewriteHtmlAssetPaths() {
  const outDir = path.join(projectRoot, 'renderer', 'out')

  if (!fs.existsSync(outDir)) {
    return
  }

  listHtmlFiles(outDir).forEach((htmlFilePath) => {
    const prefix = htmlAssetPrefix(outDir, htmlFilePath)
    const html = fs.readFileSync(htmlFilePath, 'utf8')
    const rewritten = html
      .replace(/(href|src)="\/(?:_next|static)\//g, (match, attr) =>
        match.replace(`${attr}="/`, `${attr}="${prefix}`)
      )
      .replace(/"href":"\/(?:_next|static)\//g, (match) =>
        match.replace('"href":"/', `"href":"${prefix}`)
      )
      .replace(/"src":"\/(?:_next|static)\//g, (match) =>
        match.replace('"src":"/', `"src":"${prefix}`)
      )

    if (rewritten !== html) {
      fs.writeFileSync(htmlFilePath, rewritten)
    }
  })
}

cleanRendererBuildOutput()
runNext(['build', 'renderer'])
runNext(['export', 'renderer'])
rewriteHtmlAssetPaths()
