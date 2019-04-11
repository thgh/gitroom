#!/usr/bin/env node
const path = require('path')
const fs = require('fs')

const { getRepo, log, error } = require('./util.js')

// Get repo url
const { repo, folder } = getRepo(process.argv[2]) || getRepo(process.argv[1])

if (!repo || !repo.includes('.git')) {
  error('no repo', repo)
  process.exit()
}

if (!folder || !folder.startsWith('/')) {
  error('no folder', folder)
  process.exit()
}

// Open daemon on $url and $folder
const daemon = require('daemonize2').setup({
  main: 'gitroom.js',
  name: 'gitroom',
  pidfile: 'gitroom.pid',
  argv: [repo, folder]
})

try {
  switch (process.argv[2]) {
    case undefined:
      console.log('Usage: [start|stop]')
      break

    case 'stop':
      daemon.stop()
      console.log('stopped')
      break

    default:
      if (daemon.status()) {
        daemon.stop((a, b) => {
          if (a) {
            console.error(a)
          }
          daemon.start()
          console.log('started')
        })
      } else {
        daemon.start()
        console.log('started')
      }
  }
} catch (e) {
  console.log('error')
}
