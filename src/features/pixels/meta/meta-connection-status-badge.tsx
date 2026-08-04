import { Badge } from "@/components/ui/badge";
import {
  PIXEL_CONNECTION_STATUS_INFO,
  type PixelConnectionStatus,
} from "@/features/pixels/types";

export function MetaConnectionStatusBadge({
  status,
}: {
  status: PixelConnectionStatus;
}) {
  const info = PIXEL_CONNECTION_STATUS_INFO[status];
  return <Badge variant={info.badge}>{info.label}</Badge>;
}
