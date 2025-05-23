'use strict'

const { ok } = require('node:assert')
const { resolve } = require('node:path')
const { test } = require('node:test')
const { loadConfig } = require('@platformatic/config')
const { buildServer, platformaticRuntime } = require('../..')
const { updateFile, updateConfigFile, openLogsWebsocket, waitForLogs } = require('../helpers')
const { getExpectedMessages, prepareRuntime } = require('./helper')

test('logging properly works in production mode when using separate processes', async t => {
  const root = await prepareRuntime(t, 'multiple-workers', { node: ['node'] })
  const configFile = resolve(root, './platformatic.json')
  const config = await loadConfig({}, ['-c', configFile, '--production'], platformaticRuntime)

  await updateConfigFile(resolve(root, 'node/platformatic.json'), contents => {
    contents.application = { commands: { production: 'node index.mjs' } }
  })

  await updateFile(resolve(root, 'node/index.mjs'), contents => {
    contents = contents.replace('function create', 'function main').replace('return app', 'app.listen({ port: 0 })')
    return contents + '\nmain()'
  })

  const app = await buildServer(config.configManager.current, config.args)

  const managementApiWebsocket = await openLogsWebsocket(app)

  t.after(async () => {
    await app.close()
    managementApiWebsocket.terminate()
  })

  const expectedMessages = getExpectedMessages('composer', { composer: 3, service: 3, node: 5 })
  const waitPromise = waitForLogs(managementApiWebsocket, ...expectedMessages.start, ...expectedMessages.stop)

  await app.start()
  await app.stop()

  const messages = await waitPromise

  ok(messages.find(m => m.name === 'composer'))

  for (let i = 0; i < 5; i++) {
    ok(messages.find(m => m.name === `node:${i}` && m.msg.startsWith('Server listening')))
  }
})

test('logging properly works in development mode using separate processes', async t => {
  const root = await prepareRuntime(t, 'multiple-workers', { node: ['node'] })
  const configFile = resolve(root, './platformatic.json')
  const config = await loadConfig({}, ['-c', configFile], platformaticRuntime)

  await updateConfigFile(resolve(root, 'node/platformatic.json'), contents => {
    contents.application = { commands: { production: 'node index.mjs' } }
  })

  await updateFile(resolve(root, 'node/index.mjs'), contents => {
    contents = contents.replace('function create', 'function main').replace('return app', 'app.listen({ port: 0 })')
    return contents + '\nmain()'
  })

  const app = await buildServer(config.configManager.current, config.args)

  const managementApiWebsocket = await openLogsWebsocket(app)

  t.after(async () => {
    await app.close()
    managementApiWebsocket.terminate()
  })

  const waitPromise = waitForLogs(
    managementApiWebsocket,
    'Starting the service "composer"...',
    'Starting the service "node"...',
    'Platformatic is now listening',
    'Stopping the service "composer"...',
    'Stopping the service "node"...'
  )

  await app.start()
  await app.stop()

  const messages = await waitPromise

  ok(messages.find(m => m.name === 'composer'))

  for (let i = 0; i < 5; i++) {
    ok(!messages.some(m => m.name === `node:${i}`))
  }
})
