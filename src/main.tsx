import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { App } from "./App";

const rootEl = document.getElementById("root");
if (rootEl === null) throw new Error("No #root element found");
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
);
