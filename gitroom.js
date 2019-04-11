#!/usr/bin/env node
// #!/usr/bin/env nodemon

// gitignore must exist
// .git must exist
// config must contain remote url

const {
  connectableJSON,
  error,
  fs,
  getFiles,
  getRepo,
  green,
  log,
  red,
} = require('./util.js')

const { path, folder, error: errorMessage, repo } = getRepo(process.argv[2]) ||  getRepo(process.argv[3]) || getRepo(process.cwd())
const folderI = folder + '/'
if (!repo) {
  error(red(folder ? `Folder: ${folder}` : `Path: ${path}`))
  error(red(errorMessage))
  usage()
  process.exit()
}
if (!repo.includes('.git')) {
  log('warning: remote url does not include ".git"')
}
if (repo !== process.argv[3]) {
  log('Repo:', repo)
}

const gitroomId = Math.random()
  .toString(36)
  .slice(2)
const roomUrl = 'wss://websocket-room.now.sh/gitroom?repo=' + repo
const room = connectableJSON(roomUrl)
log('URL: ', roomUrl.replace('ws', 'http'))

let heartbeat = 0
let keepAlive = false
let writeFiles = false
let watch = null
const fileCache = new Map()
const peers = new Map()
room.subscribe(data => {
  if (!data) {
    // const modified = getFiles(folder)
    log('<< hello now')
    clearInterval(heartbeat)
    heartbeat = setInterval(
      () => room.send({ heartbeat: true, gitroomId }),
      30 * 1000
    )
    return room.send({ hello: true, gitroomId })
  }
  keepAlive = true
  log('>>', data)
  if (data.byebye && data.gitroomId) {
    // TODO: detect timeouts
    // peers.add(gitroomId, true)
  }
  if (data.gitroomId && !peers.has(data.gitroomId)) {
    peers.set(data.gitroomId, true)
    const modified = getFiles(folder)
    modified.forEach(name => {
      log('<<', name)
      room.send({
        file: getFile(name)
      })
    })
  }
  if (data.gitroomId && !watch) {
    const CheapWatch = require('cheap-watch')
    const filter = require('ignore')()
      .add(
        fs
          .readFileSync(folderI + '.gitignore', 'utf8')
          .toString()
          .trim()
      )
      .add('.git')
      .add('.DS_Store')
      .createFilter()

    watch = new CheapWatch({
      dir: folder,
      filter: ({ path, stats }) => path && filter(path)
    })
    watch.init().then(() => {
      log('watching', Array.from(watch.paths.keys()).length, 'files')
      // for (const [path, stats] of watch.paths) {
      //   /* ... */
      // }

      watch.on('+', ({ path, stats, isNew }) => {
        if (!stats.isFile()) {
          return
        }
        log('+ watch', path)
        const name = path
        const content = fs.readFileSync(folderI + path, 'utf8')
        const file = {
          name,
          mtimeMs: stats.mtimeMs,
          // stats,
          content
        }
        fileCache.set(name, file)
        log('<<', file.name, content.length)
        room.send({ file })
      })
      watch.on('-', ({ path, stats }) => {
        log('removed', path)
      })
    })
    log('<< gitroomId', gitroomId)
    return room.send({ gitroomId })
  }
  if (data.file) {
    const { name, content, mtimeMs } = data.file
    const existing = fileCache.get(name) || getFile(name)
    if (existing.mtimeMs < mtimeMs) {
      fileCache.set(name, data.file)
      if (existing.content !== content) {
        if (!writeFiles) {
          // TODO: check if no conflict
          writeFiles = true
          log('Enable file writing')
        }
        log('writeFile', folderI + name, content.length)
        fs.writeFile(folderI + name, content, (err, ok) => log(err))
      } else {
        log('same content', name)
      }
    } else if (existing.mtimeMs > mtimeMs) {
      log(
        'received stale',
        name,
        existing.mtimeMs - mtimeMs,
        existing.mtimeMs,
        mtimeMs
      )
      setTimeout(() => {
        const file = getFile(name)
        log('<<', name, existing.mtimeMs, file.mtimeMs)
        room.send({
          file
        })
      }, 2000)
    }
  }
  if (data.modified) {
    log('modified', data.modified)
  }
})

setInterval(() => {
  if (!keepAlive) {
    log('Exiting')
    room.send({ byebye: true })
    process.exit()
  }
}, 60 * 1000)

function updated(file, send = false) {
  const { name, content, mtimeMs } = file
  log('updated', name)
  fileCache.set(name, file)
  if (send) {
    room.send({ file })
  } else {
    log('writeFile', folderI + name, content.length)
    fs.writeFile(folderI + name, content, (err, ok) => log(err))
  }
}

function getFile(name) {
  console.log('getFile', name)
  return {
    name,
    mtimeMs: fs.lstatSync(folderI + name).mtimeMs,
    content: fs.readFileSync(folderI + name, 'utf8')
  }
}

function usage () {
  console.log(`
Usage examples
  ${green('gitroom')}          Sync the git repo in the current working directory
  ${green('gitroom <path>')}   Sync the git repo at path`)
}
