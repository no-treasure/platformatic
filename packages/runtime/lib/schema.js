#! /usr/bin/env node
'use strict'

const telemetry = require('@platformatic/telemetry').schema
const {
  schemaComponents: { server, logger, health }
} = require('@platformatic/utils')

const workers = {
  anyOf: [
    {
      type: 'number',
      minimum: 1
    },
    { type: 'string' }
  ]
}

const services = {
  type: 'array',
  items: {
    type: 'object',
    anyOf: [{ required: ['id', 'path'] }, { required: ['id', 'url'] }],
    properties: {
      id: {
        type: 'string'
      },
      path: {
        type: 'string',
        resolvePath: true
      },
      config: {
        type: 'string'
      },
      url: {
        type: 'string'
      },
      useHttp: {
        type: 'boolean'
      },
      workers,
      health: { ...health, default: undefined }
    }
  }
}

const pkg = require('../package.json')

const platformaticRuntimeSchema = {
  $id: `https://schemas.platformatic.dev/@platformatic/runtime/${pkg.version}.json`,
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    $schema: {
      type: 'string'
    },
    preload: {
      type: 'string',
      resolvePath: true
    },
    entrypoint: {
      type: 'string'
    },
    basePath: {
      type: 'string'
    },
    autoload: {
      type: 'object',
      additionalProperties: false,
      required: ['path'],
      properties: {
        path: {
          type: 'string',
          resolvePath: true
        },
        exclude: {
          type: 'array',
          default: [],
          items: {
            type: 'string'
          }
        },
        mappings: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            additionalProperties: false,
            required: ['id'],
            properties: {
              id: {
                type: 'string'
              },
              config: {
                type: 'string'
              },
              useHttp: {
                type: 'boolean'
              },
              workers,
              health: { ...health, default: undefined }
            }
          }
        }
      }
    },
    services,
    workers: { ...workers, default: 1 },
    web: services,
    logger,
    server,
    startTimeout: {
      default: 30000,
      type: 'number',
      minimum: 0
    },
    restartOnError: {
      default: true,
      anyOf: [
        { type: 'boolean' },
        {
          type: 'number',
          minimum: 100
        }
      ]
    },
    gracefulShutdown: {
      type: 'object',
      properties: {
        runtime: {
          anyOf: [
            {
              type: 'number',
              minimum: 1
            },
            { type: 'string' }
          ],
          default: 10000
        },
        service: {
          anyOf: [
            {
              type: 'number',
              minimum: 1
            },
            { type: 'string' }
          ],
          default: 10000
        }
      },
      default: {},
      required: ['runtime', 'service'],
      additionalProperties: false
    },
    health,
    undici: {
      type: 'object',
      properties: {
        agentOptions: {
          type: 'object',
          additionalProperties: true
        },
        interceptors: {
          anyOf: [
            {
              type: 'array',
              items: {
                $ref: '#/$defs/undiciInterceptor'
              }
            },
            {
              type: 'object',
              properties: {
                Client: {
                  type: 'array',
                  items: {
                    $ref: '#/$defs/undiciInterceptor'
                  }
                },
                Pool: {
                  type: 'array',
                  items: {
                    $ref: '#/$defs/undiciInterceptor'
                  }
                },
                Agent: {
                  type: 'array',
                  items: {
                    $ref: '#/$defs/undiciInterceptor'
                  }
                }
              }
            }
          ]
        }
      }
    },
    watch: {
      anyOf: [
        {
          type: 'boolean'
        },
        {
          type: 'string'
        }
      ]
    },
    managementApi: {
      anyOf: [
        { type: 'boolean' },
        { type: 'string' },
        {
          type: 'object',
          properties: {
            logs: {
              type: 'object',
              properties: {
                maxSize: {
                  type: 'number',
                  minimum: 5,
                  default: 200
                }
              },
              additionalProperties: false
            }
          },
          additionalProperties: false
        }
      ],
      default: true
    },
    metrics: {
      anyOf: [
        { type: 'boolean' },
        {
          type: 'object',
          properties: {
            port: {
              anyOf: [{ type: 'integer' }, { type: 'string' }]
            },
            hostname: { type: 'string' },
            endpoint: { type: 'string' },
            auth: {
              type: 'object',
              properties: {
                username: { type: 'string' },
                password: { type: 'string' }
              },
              additionalProperties: false,
              required: ['username', 'password']
            },
            labels: {
              type: 'object',
              additionalProperties: { type: 'string' }
            }
          },
          additionalProperties: false
        }
      ]
    },
    telemetry,
    inspectorOptions: {
      type: 'object',
      properties: {
        host: {
          type: 'string'
        },
        port: {
          type: 'number'
        },
        breakFirstLine: {
          type: 'boolean'
        },
        watchDisabled: {
          type: 'boolean'
        }
      }
    }
  },
  anyOf: [{ required: ['autoload'] }, { required: ['services'] }, { required: ['web'] }],
  additionalProperties: false,
  $defs: {
    undiciInterceptor: {
      type: 'object',
      properties: {
        module: {
          type: 'string'
        },
        options: {
          type: 'object',
          additionalProperties: true
        }
      },
      required: ['module', 'options']
    }
  }
}

module.exports.schema = platformaticRuntimeSchema

if (require.main === module) {
  console.log(JSON.stringify(platformaticRuntimeSchema, null, 2))
}
