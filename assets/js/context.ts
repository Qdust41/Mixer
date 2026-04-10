import { createContext } from "react";

export const AuthCtx = createContext({
  email: "",
  userId: "",
  username: "",
  displayName: "",
  avatarUrl: "",
});
