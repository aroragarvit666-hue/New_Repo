/*
* <license header>
*/

/**
 * Adobe Analytics action.
 *
 * Two operations in one action (the "report-suite picker + metrics" pattern):
 *   - No `rsid`                       -> list report suites (getCollections) to populate a Picker.
 *   - `rsid` + `startDate` + `endDate`-> run a daily metrics report (getReport).
 */

const { Core } = require('@adobe/aio-sdk')
const { errorResponse, stringParameters, checkMissingRequestInputs } = require('../utils')
const { initAnalytics } = require('../lib/analytics')

async function main (params) {
  const logger = Core.Logger('main', { level: params.LOG_LEVEL || 'info' })

  try {
    logger.info('Calling the analytics action')
    logger.debug(stringParameters(params))

    // Authorization is injected by ExC Shell (require-adobe-auth: true)
    const errorMessage = checkMissingRequestInputs(params, [], ['Authorization'])
    if (errorMessage) {
      return errorResponse(400, errorMessage, logger)
    }

    const { client } = await initAnalytics(params)

    // ---- Operation 1: list report suites (no rsid) ----
    if (!params.rsid) {
      logger.info('Listing report suites')
      const res = await client.getCollections({ limit: 100 })
      const suites = (res.body.content || []).map((s) => ({ rsid: s.rsid, name: s.name }))
      return { statusCode: 200, body: { reportSuites: suites } }
    }

    // ---- Operation 2: run a report (rsid + startDate + endDate) ----
    const missing = checkMissingRequestInputs(params, ['startDate', 'endDate'], [])
    if (missing) {
      return errorResponse(400, missing, logger)
    }

    logger.info(`Running report for rsid=${params.rsid} ${params.startDate}..${params.endDate}`)
    const reportBody = {
      rsid: params.rsid,
      globalFilters: [
        {
          type: 'dateRange',
          dateRange: `${params.startDate}T00:00:00.000/${params.endDate}T00:00:00.000`
        }
      ],
      metricContainer: {
        metrics: [
          { columnId: '0', id: 'metrics/pageviews' },
          { columnId: '1', id: 'metrics/visits' },
          { columnId: '2', id: 'metrics/visitors' }
        ]
      },
      dimension: 'variables/daterangeday',
      settings: { limit: 400, page: 0 }
    }

    const res = await client.getReport(reportBody)
    const report = res.body
    const columns = ['Page Views', 'Visits', 'Visitors']
    const rows = (report.rows || []).map((r) => ({
      date: r.value,
      pageviews: r.data[0],
      visits: r.data[1],
      visitors: r.data[2]
    }))

    // Totals across the range
    const totals = rows.reduce(
      (acc, r) => ({
        pageviews: acc.pageviews + (r.pageviews || 0),
        visits: acc.visits + (r.visits || 0),
        visitors: acc.visitors + (r.visitors || 0)
      }),
      { pageviews: 0, visits: 0, visitors: 0 }
    )

    logger.info(`200: report returned ${rows.length} rows`)
    return { statusCode: 200, body: { columns, rows, totals } }
  } catch (error) {
    // aio-lib throws error objects, not HTTP responses — surface code + message
    logger.error(error)
    const message = error.message || 'server error'
    const code = error.code && Number.isInteger(error.code) ? error.code : 500
    return errorResponse(code >= 400 && code < 600 ? code : 500, message, logger)
  }
}

exports.main = main
