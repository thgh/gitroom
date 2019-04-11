const path = require('path')
const fs = require('fs')

const log = openLog(__dirname + '/gitroom.log')
const error = openLog(__dirname + '/gitroom-error.log')

module.exports = {
  connectable,
  connectableJSON,
  error,
  fs,
  getFiles,
  getRepo,
  gitFolder,
  green,
  log,
  path,
  red
}

// Reconnect after 1s, 3s, 6s, ...
function connectable(url) {
  const subs = []
  let timeout = 60000
  let ws

  connect()
  function connect() {
    const WebSocket = require('ws')
    ws = new WebSocket(url)
    ws.onclose = () => setTimeout(connect, (timeout += 1000))
    ws.onerror = ws.close
    ws.onmessage = receive
    ws.onopen = event => {
      receive(event)
      timeout = 1000
    }
  }

  function receive(event) {
    subs.forEach(sub => sub(event.data))
  }

  return {
    subscribe(handler) {
      subs.push(handler)
    },
    send(data) {
      if (ws && ws.readyState === ws.OPEN) {
        ws.send(data)
        return true
      }
      error('Not open')
      return false
    }
  }
}

function connectableJSON(url) {
  const { subscribe, send } = connectable(url)
  return {
    subscribe: handler => subscribe(data => handler(data && JSON.parse(data))),
    send: data => send(JSON.stringify(data))
  }
}

function getFiles(path) {
  return require('child_process')
    .execSync('cd ' + path + '; git diff --name-only --diff-filter=AM')
    .toString()
    .split('\n')
    .filter(Boolean)
}

function getRepo(path) {
  if (!path || !path.startsWith('/')) {
    return
  }
  const folder = gitFolder(path)
  if (!folder) {
    return { path, error: 'This path is not a git repository' }
  }
  const config = fs.readFileSync(folder + '/.git/config', 'utf8')
  const urls = config
    .split('\n')
    .map(line => {
      const m = line.match(/url\s*=\s*(.*)$/)
      return m && m[1]
    })
    .filter(Boolean)

  const url = urls && urls[0]
  if (!url) {
    return { path, folder, error: 'This git repository does not have a remote' }
  }

  const head = fs.readFileSync(folder + '/.git/HEAD', 'utf8')
  if (!head.startsWith('ref: refs/heads/')) {
    return {
      path,
      folder,
      error: 'This git repository is not on a branch'
    }
  }
  const branch = head.trim().replace('ref: refs/heads/', '')
  return {
    folder,
    path,
    repo: normalizeGitURL(url) + ':' + branch
  }
}

function normalizeGitURL(url) {
  return url.replace('https://github.com/', 'git@github.com:')
}

function gitFolder(start, check) {
  start = start || module.parent.filename
  check = check || (dir => fs.existsSync(path.resolve(dir, '.git')))

  if (typeof start === 'string') {
    if (start[start.length - 1] !== path.sep) {
      start += path.sep
    }
    start = start.split(path.sep)
  }
  if (!start.length) {
    return
  }
  start.pop()
  var dir = start.join(path.sep)
  try {
    if (check(dir)) {
      return dir
    }
  } catch (e) {}
  return gitFolder(start, check)
}

function green(text) {
  return '\u001b[1m\u001b[32m' + text + '\u001b[39m\u001b[22m'
}

function red (text) {
  return '\u001b[1m\u001b[31m' + text + '\u001b[39m\u001b[22m'
}

function openLog(logfile) {
  const stream = fs.createWriteStream(logfile, {
    flags: 'a',
    encoding: 'utf8',
    mode: 0644
  })
  return function log(...msg) {
    console.log(...msg)
    stream.write(
      new Date().toJSON() +
        ' ' +
        Array.from(msg)
          .map(m => {
            const str = typeof m !== 'string' ? JSON.stringify(m) : m
            return str.length > 120 ? str.slice(0, 100) + '...' : str
          })
          .join(' ') +
        '\n'
    )
  }
}
