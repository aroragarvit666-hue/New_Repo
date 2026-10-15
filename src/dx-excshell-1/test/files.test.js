/*
* <license header>
*/

const mockList = jest.fn()
const mockWrite = jest.fn()
const mockRead = jest.fn()
const mockDelete = jest.fn()
const mockGetProperties = jest.fn()

jest.mock('@adobe/aio-sdk', () => ({
  Core: { Logger: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), error: jest.fn() })) },
  Files: {
    init: jest.fn(async () => ({
      list: mockList,
      write: mockWrite,
      read: mockRead,
      delete: mockDelete,
      getProperties: mockGetProperties
    }))
  }
}))

const { main } = require('../actions/files/index.js')

const authHeaders = { __ow_headers: { authorization: 'Bearer fake-token' } }

beforeEach(() => jest.clearAllMocks())

describe('files action', () => {
  test('400 when Authorization header is missing', async () => {
    const res = await main({})
    expect(res.error.statusCode).toBe(400)
    expect(res.error.body.error).toContain('Authorization')
  })

  test('200 lists files (handles object + string entries, drops dirs)', async () => {
    mockList.mockResolvedValue([
      { name: 'a.txt', contentLength: 12, contentType: 'text/plain' },
      'b.bin',
      { name: 'folder/' }
    ])
    const res = await main({ ...authHeaders, operation: 'list' })
    expect(res.statusCode).toBe(200)
    expect(res.body.files).toEqual([
      { name: 'a.txt', size: 12, contentType: 'text/plain', lastModified: null },
      { name: 'b.bin', size: null, contentType: null, lastModified: null }
    ])
  })

  test('200 upload writes decoded base64 content', async () => {
    mockWrite.mockResolvedValue(5)
    const content = Buffer.from('hello').toString('base64')
    const res = await main({ ...authHeaders, operation: 'upload', name: 'h.txt', content })
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ name: 'h.txt', size: 5 })
    expect(mockWrite).toHaveBeenCalledWith('h.txt', Buffer.from('hello'))
  })

  test('400 upload missing content', async () => {
    const res = await main({ ...authHeaders, operation: 'upload', name: 'h.txt' })
    expect(res.error.statusCode).toBe(400)
    expect(res.error.body.error).toContain('content')
  })

  test('200 download returns base64 + contentType', async () => {
    mockRead.mockResolvedValue(Buffer.from('world'))
    mockGetProperties.mockResolvedValue({ contentType: 'text/plain' })
    const res = await main({ ...authHeaders, operation: 'download', name: 'w.txt' })
    expect(res.statusCode).toBe(200)
    expect(res.body.name).toBe('w.txt')
    expect(res.body.contentType).toBe('text/plain')
    expect(Buffer.from(res.body.content, 'base64').toString()).toBe('world')
  })

  test('200 delete', async () => {
    mockDelete.mockResolvedValue(1)
    const res = await main({ ...authHeaders, operation: 'delete', name: 'gone.txt' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ name: 'gone.txt', deleted: true })
    expect(mockDelete).toHaveBeenCalledWith('gone.txt')
  })

  test('400 unknown operation', async () => {
    const res = await main({ ...authHeaders, operation: 'frobnicate' })
    expect(res.error.statusCode).toBe(400)
    expect(res.error.body.error).toContain('frobnicate')
  })

  test('500 when the SDK throws', async () => {
    mockList.mockRejectedValue(new Error('files boom'))
    const res = await main({ ...authHeaders, operation: 'list' })
    expect(res.error.statusCode).toBe(500)
    expect(res.error.body.error).toContain('files boom')
  })
})
