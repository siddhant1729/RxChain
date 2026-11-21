import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { Button } from "../components/ui";

export default function NotFound() {
  return (
    <EmptyState
      icon={<Compass className="h-6 w-6" />}
      title="Page not found"
      message="The page you are looking for does not exist."
      action={
        <Link to="/">
          <Button>Back home</Button>
        </Link>
      }
    />
  );
}
