import React, { useEffect, useState } from 'react'
import { Box, Button, Card, CardContent, Container, Grid, TextField, Typography, Table, TableHead, TableRow, TableCell, TableBody } from '@mui/material'
import axios from 'axios'

interface Job {
  id: number
  status: string
  effective_date: string
  job_type: string
}

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

const App: React.FC = () => {
  const [jobs, setJobs] = useState<Job[]>([])
  const [effectiveDate, setEffectiveDate] = useState('')
  const [files, setFiles] = useState<Record<string, File | null>>({
    customer_tiers_csv: null,
    del_base_xlsx: null,
    nondel_base_xlsx: null,
    adjustors_xlsx: null,
  })

  const loadJobs = async () => {
    const res = await axios.get(`${API_BASE}/api/phh/jobs`)
    setJobs(res.data)
  }

  useEffect(() => {
    loadJobs()
  }, [])

  const onFileChange = (key: string, fileList: FileList | null) => {
    setFiles({ ...files, [key]: fileList?.[0] || null })
  }

  const handleUpload = async () => {
    const form = new FormData()
    form.append('effective_date', effectiveDate)
    Object.entries(files).forEach(([key, file]) => {
      if (file) form.append(key, file)
    })
    await axios.post(`${API_BASE}/api/phh/ingest`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    await loadJobs()
  }

  return (
    <Container sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>PHH Non-Agency Dashboard</Typography>
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={3}>
              <TextField fullWidth label="Effective Date" type="date" InputLabelProps={{ shrink: true }} value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            </Grid>
            {Object.keys(files).map(key => (
              <Grid item xs={12} md={3} key={key}>
                <Button variant="contained" component="label" fullWidth>
                  {files[key as keyof typeof files]?.name || key}
                  <input hidden type="file" onChange={(e) => onFileChange(key, e.target.files)} />
                </Button>
              </Grid>
            ))}
            <Grid item xs={12}>
              <Button variant="contained" onClick={handleUpload} disabled={!effectiveDate}>Upload Inputs & Start Run</Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Job Runs</Typography>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Effective Date</TableCell>
                <TableCell>Job Type</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {jobs.map(job => (
                <TableRow key={job.id}>
                  <TableCell>{job.id}</TableCell>
                  <TableCell>{job.status}</TableCell>
                  <TableCell>{job.effective_date}</TableCell>
                  <TableCell>{job.job_type}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Container>
  )
}

export default App
