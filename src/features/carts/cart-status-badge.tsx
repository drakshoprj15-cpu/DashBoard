import { Badge } from "@/components/ui/badge";
import { CATEGORY_BADGE_VARIANT, CATEGORY_LABEL, type CartCategory } from "@/features/carts/status";

export function CartStatusBadge({ category }: { category: CartCategory }) {
  return <Badge variant={CATEGORY_BADGE_VARIANT[category]}>{CATEGORY_LABEL[category]}</Badge>;
}
