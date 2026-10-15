/*
* <license header>
*/

/**
 * File System action backed by the Adobe I/O Files SDK (@adobe/aio-sdk -> Files).
 *
 * Operations (via `operation` param, default 'list'):
 *   - list                       -> { files: [{ name, size, contentType, lastModified }] }
 *   - upload   { name, content } -> writes base64 `content` to `name`; returns { name, size }
 *   - download { name }          -> { name, content (base64), contentType }
 *   - delete   { name }          -> { name, deleted: true }
 *
 * NOTE: the Files SDK needs real Runtime credentials — run with `aio app run`
 * (NOT `aio app dev`, which is stateless) or a deployed action.
 * Action payloads are capped at ~1 MB, so base64 upload/download suits small files.
 */

const { Core, Files } = require('@adobe/aio-sdk')
const { errorResponse, stringParameters, checkMissingRequestInputs } = require('../utils')

// Normalise one entry from files.list() — it may be a string path or a properties object.
function toEntry (item) {
  if (typeof item === 'string') {
    return { name: item, size: null, contentType: null, lastModified: null }
  }
  return {
    name: item.name,
    size: typeof item.contentLength === 'number' ? item.contentLength : null,
    contentType: item.contentType || null,
    lastModified: item.lastModified || null
  }
}

async function main (params) {
  const logger = Core.Logger('main', { level: params.LOG_LEVEL || 'info' })

  try {
    logger.info('Calling the files action')
    logger.debug(stringParameters(params))

    const errorMessage = checkMissingRequestInputs(params, [], ['Authorization'])
    if (errorMessage) {
      return errorResponse(400, errorMessage, logger)
    }

    const operation = params.operation || 'list'
    const files = await Files.init()

    switch (operation) {
      case 'list': {
        const raw = await files.list('/')
        const list = (raw || [])
          .map(toEntry)
          .filter((f) => f.name && !f.name.endsWith('/')) // drop directory markers
        logger.info(`200: listed ${list.length} files`)
        return { statusCode: 200, body: { files: list } }
      }

      case 'upload': {
        const missing = checkMissingRequestInputs(params, ['name', 'content'], [])
        if (missing) return errorResponse(400, missing, logger)
        const buffer = Buffer.from(params.content, 'base64')
        await files.write(params.name, buffer)
        logger.info(`200: wrote ${params.name} (${buffer.length} bytes)`)
        return { statusCode: 200, body: { name: params.name, size: buffer.length } }
      }

      case 'download': {
        const missing = checkMissingRequestInputs(params, ['name'], [])
        if (missing) return errorResponse(400, missing, logger)
        const buffer = await files.read(params.name)
        let contentType = null
        try {
          const props = await files.getProperties(params.name)
          contentType = props.contentType || null
        } catch (e) {
          logger.debug(`getProperties failed for ${params.name}: ${e.message}`)
        }
        logger.info(`200: read ${params.name} (${buffer.length} bytes)`)
        return {
          statusCode: 200,
          body: {
            name: params.name,
            content: buffer.toString('base64'),
            contentType: contentType || 'application/octet-stream'
          }
        }
      }

      case 'delete': {
        const missing = checkMissingRequestInputs(params, ['name'], [])
        if (missing) return errorResponse(400, missing, logger)
        await files.delete(params.name)
        logger.info(`200: deleted ${params.name}`)
        return { statusCode: 200, body: { name: params.name, deleted: true } }
      }

      default:
        return errorResponse(400, `unknown operation '${operation}'`, logger)
    }
  } catch (error) {
    logger.error(error)
    return errorResponse(500, error.message || 'server error', logger)
  }
}

exports.main = main
