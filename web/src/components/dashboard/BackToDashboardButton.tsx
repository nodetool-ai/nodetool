import React, { memo, useCallback, forwardRef, startTransition } from "react";
import DashboardIcon from "@mui/icons-material/Dashboard";
import { useNavigate } from "react-router-dom";
import { NavButton } from "../ui_primitives";

const BackToDashboardButton = forwardRef<HTMLButtonElement>((props, ref) => {
  const navigate = useNavigate();

  const handleClick = useCallback(() => {
    startTransition(() => {
      navigate("/dashboard");
    });
  }, [navigate]);

  return (
    <NavButton
      ref={ref}
      icon={<DashboardIcon />}
      label="Dashboard"
      onClick={handleClick}
      className="back-to-dashboard"
      nodrag={false}
      {...props}
    />
  );
});

BackToDashboardButton.displayName = "BackToDashboardButton";

export default memo(BackToDashboardButton);
