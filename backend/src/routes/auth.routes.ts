import { Router } from "express";
import {
  exchangeGithubOAuthCode,
  githubCallback,
  githubLogin,
  login,
  register,
} from "../controllers/auth.controller";

export const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.get("/github", githubLogin);
authRouter.get("/github/callback", githubCallback);
authRouter.post("/github/exchange", exchangeGithubOAuthCode);
