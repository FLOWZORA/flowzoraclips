import { redirect } from 'next/navigation';

export default function PricingPage() {
  // Pricing is temporarily removed while in 100% free beta.
  // When ready to reintroduce pricing once traffic targets are reached, restore the original PricingTable.
  redirect('/');
}
