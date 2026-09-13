import { redirect } from 'next/navigation';

// The topology now lives on the architecture home (the workspace). Keep old
// links and bookmarks working.
export default function TopologyRedirect({ params }: { params: { id: string } }) {
  redirect(`/architectures/${params.id}`);
}
