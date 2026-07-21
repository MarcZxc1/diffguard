import { Router } from "express";
import {
  exchangeGithubOAuthCode,
  githubCallback,
  githubLogin,
  linkGithub,
  login,
  register,
} from "../controllers/auth.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

export const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.get("/github", githubLogin);
authRouter.post("/github/link", authMiddleware, linkGithub);
authRouter.get("/github/callback", githubCallback);
authRouter.post("/github/exchange", exchangeGithubOAuthCode);
