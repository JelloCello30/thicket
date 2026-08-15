import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import "../styles.css";
import { FocusIntercept } from "./FocusIntercept";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FocusIntercept />
  </StrictMode>,
);
