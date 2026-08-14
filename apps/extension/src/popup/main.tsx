import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import "../styles.css";
import { Popup } from "./Popup";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);
