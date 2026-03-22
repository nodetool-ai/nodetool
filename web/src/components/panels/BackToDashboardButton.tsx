import { memo, forwardRef, useCallback } from "react";
import DashboardIcon from "@mui/icons-material/Dashboard";
import { useNavigate } from "react-router-dom";
import { NavButton } from "../ui_primitives";

interface BackToDashboardButtonProps {
  title?: string;
}

const BackToDashboardButton = forwardRef<
  HTMLButtonElement,
  BackToDashboardButtonProps
>(({ title, ...props }, ref) => {
  const navigate = useNavigate();

  const handleNavigate = useCallback(() => {
    navigate("/dashboard");
  }, [navigate]);

  return (
    <NavButton
      ref={ref}
      icon={<DashboardIcon />}
      label={title || "Dashboard"}
      onClick={handleNavigate}
      className="back-to-dashboard"
      nodrag={false}
      {...props}
    />
  );
});

BackToDashboardButton.displayName = "BackToDashboardButton";

export default memo(BackToDashboardButton);
