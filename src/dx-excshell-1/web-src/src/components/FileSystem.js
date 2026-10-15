/*
* <license header>
*/

import React, { useState, useEffect, useCallback, useRef } from 'react'
import PropTypes from 'prop-types'
import {
  View,
  Flex,
  Heading,
  Content,
  Button,
  ActionButton,
  ProgressCircle,
  InlineAlert,
  IllustratedMessage,
  TableView,
  TableHeader,
  TableBody,
  Column,
  Row,
  Cell,
  Text
} from '@adobe/react-spectrum'
import UploadToCloud from '@spectrum-icons/workflow/UploadToCloud'
import Download from '@spectrum-icons/workflow/Download'
import Delete from '@spectrum-icons/workflow/Delete'
import NotFound from '@spectrum-icons/illustrations/NotFound'

import allActions from '../config.json'
import actionWebInvoke from '../utils'

// Resolve the deployed URL for the files action (key is "<package>/files").
const filesUrl =
  allActions['dx-excshell-1/files'] ||
  allActions[Object.keys(allActions).find((k) => k.endsWith('/files')) || '']

// ~1 MB action payload cap; base64 inflates ~33%, so keep raw uploads under ~700 KB.
const MAX_UPLOAD_BYTES = 700 * 1024

const headers = (ims) => {
  const h = { 'Content-Type': 'application/json' }
  if (ims.token) h.authorization = `Bearer ${ims.token}`
  if (ims.org) h['x-gw-ims-org-id'] = ims.org
  return h
}

// Read a File as base64 (strips the "data:...;base64," prefix).
function fileToBase64 (file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

// Trigger a browser download from a base64 string.
function downloadBase64 (base64, name, contentType) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const blob = new Blob([bytes], { type: contentType || 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function formatSize (bytes) {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const FileSystem = (props) => {
  const { ims } = props
  const fileInputRef = useRef(null)

  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false) // upload/download/delete in flight

  const call = useCallback(
    (params) => actionWebInvoke(filesUrl, headers(ims), params),
    [ims]
  )

  const refresh = useCallback(async () => {
    if (!filesUrl) {
      setError('Action URL not available yet — run the app (aio app run) or deploy it (aio app deploy).')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await call({ operation: 'list' })
      setFiles(res.files || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [call])

  useEffect(() => { refresh() }, [refresh])

  async function onFilePicked (event) {
    const file = event.target.files && event.target.files[0]
    event.target.value = '' // allow re-selecting the same file later
    if (!file) return
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`"${file.name}" is ${formatSize(file.size)} — uploads must stay under ${formatSize(MAX_UPLOAD_BYTES)} (action payload limit).`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const content = await fileToBase64(file)
      await call({ operation: 'upload', name: file.name, content })
      await refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function onDownload (name) {
    setBusy(true)
    setError(null)
    try {
      const res = await call({ operation: 'download', name })
      downloadBase64(res.content, res.name, res.contentType)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function onDelete (name) {
    setBusy(true)
    setError(null)
    try {
      await call({ operation: 'delete', name })
      await refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <View width="100%" maxWidth="size-9000">
      <Flex direction="row" justifyContent="space-between" alignItems="center" wrap gap="size-200">
        <View>
          <Heading level={1}>File System</Heading>
          <Content>Upload and download files stored in your App Builder Files storage.</Content>
        </View>
        <Flex gap="size-100" alignItems="center">
          {busy && <ProgressCircle aria-label="Working" isIndeterminate size="S" />}
          <Button
            variant="accent"
            onPress={() => fileInputRef.current && fileInputRef.current.click()}
            isDisabled={busy || !filesUrl}
          >
            <UploadToCloud /><Text>Upload file</Text>
          </Button>
        </Flex>
      </Flex>

      {/* Hidden native input drives file selection; the Spectrum button triggers it. */}
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={onFilePicked}
      />

      {error && (
        <View marginY="size-200">
          <InlineAlert variant="negative">
            <Heading>Something went wrong</Heading>
            <Content>{error}</Content>
          </InlineAlert>
        </View>
      )}

      <View marginTop="size-300">
        {loading ? (
          <Flex alignItems="center" justifyContent="center" height="size-3000">
            <ProgressCircle aria-label="Loading files" isIndeterminate size="L" />
          </Flex>
        ) : (
          <TableView aria-label="Stored files" height="size-4600">
            <TableHeader>
              <Column key="name" isRowHeader>Name</Column>
              <Column key="size" align="end" width="size-1250">Size</Column>
              <Column key="type">Type</Column>
              <Column key="actions" align="end" width="size-2000">Actions</Column>
            </TableHeader>
            <TableBody
              items={files.map((f) => ({ id: f.name, ...f }))}
              renderEmptyState={() => (
                <IllustratedMessage>
                  <NotFound />
                  <Heading>No files yet</Heading>
                  <Content>Upload a file to get started.</Content>
                </IllustratedMessage>
              )}
            >
              {(item) => (
                <Row key={item.id}>
                  <Cell>{item.name}</Cell>
                  <Cell>{formatSize(item.size)}</Cell>
                  <Cell>{item.contentType || '—'}</Cell>
                  <Cell>
                    <Flex gap="size-100" justifyContent="end">
                      <ActionButton
                        isQuiet
                        aria-label={`Download ${item.name}`}
                        isDisabled={busy}
                        onPress={() => onDownload(item.name)}
                      >
                        <Download />
                      </ActionButton>
                      <ActionButton
                        isQuiet
                        aria-label={`Delete ${item.name}`}
                        isDisabled={busy}
                        onPress={() => onDelete(item.name)}
                      >
                        <Delete />
                      </ActionButton>
                    </Flex>
                  </Cell>
                </Row>
              )}
            </TableBody>
          </TableView>
        )}
      </View>
    </View>
  )
}

FileSystem.propTypes = {
  runtime: PropTypes.any,
  ims: PropTypes.any
}

export default FileSystem
