import CodeBlockWriter from 'code-block-writer'
import { generateOperationId } from '@platformatic/client'
import { capitalize } from './utils.mjs'
import camelcase from 'camelcase'
import { writeOperations } from '../../client-cli/lib/openapi-common.mjs'

export function processFrontendOpenAPI ({ schema, name, language, fullResponse }) {
  return {
    types: generateTypesFromOpenAPI({ schema, name, fullResponse }),
    implementation: generateFrontendImplementationFromOpenAPI({ schema, name, language, fullResponse })
  }
}

function generateFrontendImplementationFromOpenAPI ({ schema, name, language, fullResponse }) {
  const camelCaseName = capitalize(camelcase(name))
  const { paths } = schema
  const generatedOperationIds = []
  const operations = Object.entries(paths).flatMap(([path, methods]) => {
    return Object.entries(methods).map(([method, operation]) => {
      const opId = generateOperationId(path, method, operation, generatedOperationIds)
      return {
        path,
        method,
        operation: {
          ...operation,
          operationId: opId
        }
      }
    })
  })

  /* eslint-disable new-cap */
  const writer = new CodeBlockWriter({
    indentNumberOfSpaces: 2,
    useTabs: false,
    useSingleQuote: true
  })

  writer.write('// This client was generated by Platformatic from an OpenAPI specification.')
  writer.blankLine()

  writer.conditionalWriteLine(language === 'ts', `import type { ${camelCaseName} } from './${name}-types'`)
  writer.conditionalWriteLine(language === 'ts', `import type * as Types from './${name}-types'`)
  writer.blankLineIfLastNot()

  writer.writeLine('// The base URL for the API. This can be overridden by calling `setBaseUrl`.')
  writer.writeLine('let baseUrl = \'\'')
  if (language === 'ts') {
    writer.writeLine(
      'export const setBaseUrl = (newUrl: string) : void => { baseUrl = newUrl }'
    )
  } else {
    writer.writeLine(
      `/**  @type {import('./${name}-types.d.ts').${camelCaseName}['setBaseUrl']} */`
    )
    writer.writeLine(
      'export const setBaseUrl = (newUrl) => { baseUrl = newUrl }'
    )
  }
  writer.blankLine()
  const allOperations = []
  const originalFullResponse = fullResponse
  let currentFullResponse = originalFullResponse
  for (const operation of operations) {
    const { operationId, responses } = operation.operation
    const operationRequestName = `${capitalize(operationId)}Request`
    const underscoredOperationId = `_${operationId}`

    allOperations.push(operationId)
    const { method, path } = operation

    // Only dealing with success responses
    const successResponses = Object.entries(responses).filter(([s]) => s.startsWith('2'))

    /* c8 ignore next 3 */
    if (successResponses.length !== 1) {
      currentFullResponse = true
    }
    if (language === 'ts') {
      // Write
      //
      // ```ts
      // export const getMovies:Api['getMovies'] = async (request) => {
      // ```
      writer.write(
          `const ${underscoredOperationId} = async (url: string, request: Types.${operationRequestName}) =>`
      )
    } else {
      writer.write(`async function ${underscoredOperationId} (url, request)`)
    }

    writer.block(() => {
      // Transform
      // /organizations/{orgId}/members/{memberId}
      // to
      // /organizations/${request.orgId}/members/${request.memberId}
      const stringLiteralPath = path.replace(/\{/gm, '${request.')

      // GET methods need query strings instead of JSON bodies
      if (method === 'get') {
        writer.writeLine(
          `const response = await fetch(\`\${url}${stringLiteralPath}?\${new URLSearchParams(Object.entries(request || {})).toString()}\`)`
        )
      } else {
        writer
          .write(`const response = await fetch(\`\${url}${stringLiteralPath}\`, `)
          .inlineBlock(() => {
            writer.write('method: ').quote().write(method.toUpperCase()).quote().write(',')
            writer.writeLine('body: JSON.stringify(request),')
            writer.write('headers:').block(() => {
              writer.writeLine('\'Content-type\': \'application/json\'')
            })
          })
          .write(')')
      }

      writer.blankLine()
      if (currentFullResponse) {
        writer.write('let body = await response.text()')

        writer.blankLine()

        writer.write('try').block(() => {
          writer.write('body = JSON.parse(body)')
        })
        writer.write('catch (err)').block(() => {
          writer.write('// do nothing and keep original body')
        })

        writer.blankLine()

        writer.write('return').block(() => {
          writer.writeLine('statusCode: response.status,')
          writer.writeLine('headers: response.headers,')
          writer.writeLine('body')
        })
      } else {
        writer.write('if (!response.ok)').block(() => {
          writer.writeLine('throw new Error(await response.text())')
        })

        writer.blankLine()

        writer.writeLine('return await response.json()')
      }
    })
    writer.blankLine()
    if (language === 'ts') {
      writer.write(`export const ${operationId}: ${camelCaseName}['${operationId}'] = async (request: Types.${operationRequestName}) =>`).block(() => {
        writer.write(`return await ${underscoredOperationId}(baseUrl, request)`)
      })
    } else {
      // The JS version uses the JSDoc type format to offer IntelliSense autocompletion to the developer.
      //
      // ```js
      // /** @type {import('./api-types.d.ts').Api['getMovies']} */
      // export const getMovies = async (request) => {
      // ```
      //
      writer
        .writeLine(
          `/**  @type {import('./${name}-types.d.ts').${camelCaseName}['${operationId}']} */`
        )
        .write(`export const ${operationId} = async (request) =>`).block(() => {
          writer.write(`return await ${underscoredOperationId}(baseUrl, request)`)
        })
    }
    currentFullResponse = originalFullResponse
  }
  // create factory
  const factoryBuildFunction = language === 'ts'
    ? 'export default function build (url: string)'
    : 'export default function build (url)'
  writer.write(factoryBuildFunction).block(() => {
    writer.write('return').block(() => {
      for (const [idx, op] of allOperations.entries()) {
        const underscoredOperation = `_${op}`
        const methodString = `${op}: ${underscoredOperation}.bind(url, ...arguments)`
        if (idx === allOperations.length - 1) {
          writer.writeLine(`${methodString}`)
        } else {
          writer.writeLine(`${methodString},`)
        }
      }
    })
  })

  return writer.toString()
}

function generateTypesFromOpenAPI ({ schema, name, fullResponse }) {
  const camelCaseName = capitalize(camelcase(name))
  const { paths } = schema
  const generatedOperationIds = []
  const operations = Object.entries(paths).flatMap(([path, methods]) => {
    return Object.entries(methods).map(([method, operation]) => {
      const opId = generateOperationId(path, method, operation, generatedOperationIds)
      return {
        path,
        method,
        operation: {
          ...operation,
          operationId: opId
        }
      }
    })
  })
  /* eslint-disable new-cap */
  const writer = new CodeBlockWriter({
    indentNumberOfSpaces: 2,
    useTabs: false,
    useSingleQuote: true
  })

  const interfaces = new CodeBlockWriter({
    indentNumberOfSpaces: 2,
    useTabs: false,
    useSingleQuote: true
  })
  /* eslint-enable new-cap */
  interfaces.write('export interface FullResponse<T, U extends number>').block(() => {
    interfaces.writeLine('\'statusCode\': U;')
    interfaces.writeLine('\'headers\': object;')
    interfaces.writeLine('\'body\': T;')
  })
  interfaces.blankLine()

  writer.blankLine()
  writer.write(`export interface ${camelCaseName}`).block(() => {
    writer.writeLine('setBaseUrl(newUrl: string) : void;')
    writeOperations(interfaces, writer, operations, {
      fullRequest: false, fullResponse, optionalHeaders: [], schema
    })
  })

  writer.writeLine(`type PlatformaticFrontendClient = Omit<${capitalize(name)}, 'setBaseUrl'>`)
  writer.writeLine('export default function build(url: string): PlatformaticFrontendClient')
  return interfaces.toString() + writer.toString()
}
