/*
* <license header>
*/

const mockGetCollections = jest.fn()
const mockGetReport = jest.fn()

jest.mock('@adobe/aio-sdk', () => ({
  Core: { Logger: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), error: jest.fn() })) }
}))

// Mock the analytics lib so no real IMS/network calls happen.
jest.mock('../actions/lib/analytics', () => ({
  initAnalytics: jest.fn(async () => ({
    client: { getCollections: mockGetCollections, getReport: mockGetReport }
  }))
}))

const { main } = require('../actions/analytics/index.js')

const authHeaders = { __ow_headers: { authorization: 'Bearer fake-token' } }

beforeEach(() => {
  jest.clearAllMocks()
})

describe('analytics action', () => {
  test('400 when Authorization header is missing', async () => {
    const res = await main({})
    expect(res.error.statusCode).toBe(400)
    expect(res.error.body.error).toContain('Authorization')
  })

  test('200 lists report suites when no rsid is given', async () => {
    mockGetCollections.mockResolvedValue({
      body: { content: [{ rsid: 'rs1', name: 'Suite One' }, { rsid: 'rs2', name: 'Suite Two' }] }
    })
    const res = await main({ ...authHeaders })
    expect(res.statusCode).toBe(200)
    expect(res.body.reportSuites).toEqual([
      { rsid: 'rs1', name: 'Suite One' },
      { rsid: 'rs2', name: 'Suite Two' }
    ])
  })

  test('400 when rsid given but date range missing', async () => {
    const res = await main({ ...authHeaders, rsid: 'rs1' })
    expect(res.error.statusCode).toBe(400)
    expect(res.error.body.error).toMatch(/startDate|endDate/)
  })

  test('200 returns report rows and totals', async () => {
    mockGetReport.mockResolvedValue({
      body: {
        rows: [
          { value: '2026-10-01', data: [100, 40, 30] },
          { value: '2026-10-02', data: [200, 60, 50] }
        ]
      }
    })
    const res = await main({ ...authHeaders, rsid: 'rs1', startDate: '2026-10-01', endDate: '2026-10-07' })
    expect(res.statusCode).toBe(200)
    expect(res.body.rows).toHaveLength(2)
    expect(res.body.totals).toEqual({ pageviews: 300, visits: 100, visitors: 80 })
  })

  test('500 when the SDK throws', async () => {
    mockGetCollections.mockRejectedValue(new Error('aio-lib boom'))
    const res = await main({ ...authHeaders })
    expect(res.error.statusCode).toBe(500)
    expect(res.error.body.error).toContain('aio-lib boom')
  })
})
