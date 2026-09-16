import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { LandingPage } from '@/components/landing/landing-page'

export default async function HomePage() {
  const session = await getServerSession(authOptions)

  return <LandingPage isLoggedIn={Boolean(session)} />
}
