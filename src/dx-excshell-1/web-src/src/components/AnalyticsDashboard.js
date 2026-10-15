/*
* <license header>
*/

import React, { useState, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'
import {
  View,
  Flex,
  Heading,
  Content,
  Picker,
  Item,
  Button,
  ProgressCircle,
  InlineAlert,
  IllustratedMessage,
  TableView,
  TableHeader,
  TableBody,
  Column,
  Row,
  Cell,
  Text,
  Divider
} from '@adobe/react-spectrum'
import NotFound from '@spectrum-icons/illustrations/NotFound'

import allActions from '../config.json'
import actionWebInvoke from '../utils'

// Resolve the deployed URL for the analytics action (key is "<package>/analytics").
const analyticsUrl =
  allActions['dx-excshell-1/analytics'] ||
  allActions[Object.keys(allActions).find((k) => k.endsWith('/analytics')) || '']

// Date-range presets (days back from today).
const RANGES = [
  { id: '7', name: 'Last 7 days' },
  { id: '30', name: 'Last 30 days' },
  { id: '90', name: 'Last 90 days' }
]

// Returns { startDate, endDate } as YYYY-MM-DD, endDate = today.
function rangeToDates (days) {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - Number(days))
  const fmt = (d) => d.toISOString().slice(0, 10)
  return { startDate: fmt(start), endDate: fmt(end) }
}

const headers = (ims) => {
  const h = { 'Content-Type': 'application/json' }
  if (ims.token) h.authorization = `Bearer ${ims.token}`
  if (ims.org) h['x-gw-ims-org-id'] = ims.org
  return h
}

const AnalyticsDashboard = (props) => {
  const { ims } = props

  const [suites, setSuites] = useState([])
  const [suitesLoading, setSuitesLoading] = useState(true)
  const [suitesError, setSuitesError] = useState(null)

  const [selectedSuite, setSelectedSuite] = useState(null)
  const [selectedRange, setSelectedRange] = useState('7')

  const [report, setReport] = useState(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState(null)

  // 1. On load, fetch the available report suites and populate the Picker.
  const loadSuites = useCallback(async () => {
    if (!analyticsUrl) {
      setSuitesError('Action URL not available yet — deploy the app (aio app deploy) or run the preview.')
      setSuitesLoading(false)
      return
    }
    setSuitesLoading(true)
    setSuitesError(null)
    try {
      const res = await actionWebInvoke(analyticsUrl, headers(ims), {})
      setSuites(res.reportSuites || [])
    } catch (e) {
      setSuitesError(e.message)
    } finally {
      setSuitesLoading(false)
    }
  }, [ims])

  useEffect(() => { loadSuites() }, [loadSuites])

  // 2. + 3. Run the report for the selected suite + date range, then display it.
  async function loadReport () {
    if (!selectedSuite || !analyticsUrl) return
    setReportLoading(true)
    setReportError(null)
    setReport(null)
    try {
      const { startDate, endDate } = rangeToDates(selectedRange)
      const res = await actionWebInvoke(analyticsUrl, headers(ims), {
        rsid: selectedSuite,
        startDate,
        endDate
      })
      setReport(res)
    } catch (e) {
      setReportError(e.message)
    } finally {
      setReportLoading(false)
    }
  }

  return (
    <View width="100%" maxWidth="size-9000">
      <Heading level={1}>Adobe Analytics Dashboard</Heading>
      <Content>Select a report suite and date range to view traffic metrics.</Content>

      {suitesError && (
        <View marginY="size-200">
          <InlineAlert variant="negative">
            <Heading>Could not load report suites</Heading>
            <Content>{suitesError}</Content>
          </InlineAlert>
        </View>
      )}

      <Flex direction="row" gap="size-200" alignItems="end" wrap marginTop="size-300">
        <Picker
          label="Report suite"
          placeholder={suitesLoading ? 'Loading…' : 'Select a report suite'}
          isLoading={suitesLoading}
          isDisabled={suitesLoading || suites.length === 0}
          items={suites}
          selectedKey={selectedSuite}
          onSelectionChange={(key) => { setSelectedSuite(key); setReport(null); setReportError(null) }}
          width="size-3600"
        >
          {(item) => <Item key={item.rsid}>{item.name}</Item>}
        </Picker>

        <Picker
          label="Date range"
          items={RANGES}
          selectedKey={selectedRange}
          onSelectionChange={setSelectedRange}
          isDisabled={!selectedSuite}
          width="size-2400"
        >
          {(item) => <Item key={item.id}>{item.name}</Item>}
        </Picker>

        <Button
          variant="accent"
          onPress={loadReport}
          isDisabled={!selectedSuite || reportLoading}
          isPending={reportLoading}
        >
          Load Report
        </Button>
      </Flex>

      <Divider size="S" marginY="size-300" />

      {reportError && (
        <InlineAlert variant="negative">
          <Heading>Report failed</Heading>
          <Content>{reportError}</Content>
        </InlineAlert>
      )}

      {reportLoading && (
        <Flex alignItems="center" justifyContent="center" height="size-3000">
          <ProgressCircle aria-label="Loading report" isIndeterminate size="L" />
        </Flex>
      )}

      {!reportLoading && !reportError && report && (
        <ReportView report={report} />
      )}

      {!reportLoading && !reportError && !report && selectedSuite && (
        <Content>Choose a date range and press <strong>Load Report</strong>.</Content>
      )}
    </View>
  )
}

const StatTile = ({ label, value }) => (
  <View
    backgroundColor="gray-100"
    borderRadius="medium"
    padding="size-200"
    minWidth="size-2000"
  >
    <Text UNSAFE_style={{ fontSize: '0.85rem', color: 'var(--spectrum-global-color-gray-700)' }}>{label}</Text>
    <Heading level={2} margin="size-0">{Number(value || 0).toLocaleString()}</Heading>
  </View>
)

StatTile.propTypes = { label: PropTypes.string, value: PropTypes.number }

const ReportView = ({ report }) => {
  const { rows = [], totals = {} } = report
  return (
    <View>
      <Flex direction="row" gap="size-200" wrap marginBottom="size-300">
        <StatTile label="Total Page Views" value={totals.pageviews} />
        <StatTile label="Total Visits" value={totals.visits} />
        <StatTile label="Total Visitors" value={totals.visitors} />
      </Flex>

      <TableView aria-label="Daily analytics report" height="size-4600">
        <TableHeader>
          <Column key="date">Date</Column>
          <Column key="pageviews" align="end">Page Views</Column>
          <Column key="visits" align="end">Visits</Column>
          <Column key="visitors" align="end">Visitors</Column>
        </TableHeader>
        <TableBody
          items={rows.map((r, i) => ({ id: i, ...r }))}
          renderEmptyState={() => (
            <IllustratedMessage>
              <NotFound />
              <Heading>No data</Heading>
              <Content>This report suite has no data for the selected range.</Content>
            </IllustratedMessage>
          )}
        >
          {(item) => (
            <Row key={item.id}>
              <Cell>{item.date}</Cell>
              <Cell>{Number(item.pageviews || 0).toLocaleString()}</Cell>
              <Cell>{Number(item.visits || 0).toLocaleString()}</Cell>
              <Cell>{Number(item.visitors || 0).toLocaleString()}</Cell>
            </Row>
          )}
        </TableBody>
      </TableView>
    </View>
  )
}

ReportView.propTypes = { report: PropTypes.object }

AnalyticsDashboard.propTypes = {
  runtime: PropTypes.any,
  ims: PropTypes.any
}

export default AnalyticsDashboard
