import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'ServiceLens — the mesh, observed',
  description:
    'Onboard microservices from GitHub, map dependencies from code, monitor every app and datastore, and respond to incidents with AI-assisted root-cause analysis.',
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return children
}
