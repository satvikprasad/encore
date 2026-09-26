import { redirect } from "next/navigation";

// Rankings live on the profile now; the review → compare flow still lands here.
export default function RankPage() {
  redirect("/profile");
}
