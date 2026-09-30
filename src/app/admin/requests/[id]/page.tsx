import RequestDetail from "@/components/RequestDetail";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <RequestDetail id={(await params).id} admin />;
}
