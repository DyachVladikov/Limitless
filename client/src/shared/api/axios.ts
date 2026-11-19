import axios from "axios";

export type MentorPopup = {
  name: string;
  text: string;
  image: string;
};

export type GameEvent = {
  type: string;
  mentorPopup?: MentorPopup;
};

type GameAnswer = {
  data: unknown;
  profile: { version: string };
  events: GameEvent[];
};

declare module "axios" {
  interface AxiosResponse {
    events?: GameEvent[];
    profile?: { version: string };
  }
}

export const api = axios.create({
  baseURL: "http://localhost:8080/api/",
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

function isGameAnswer(body: unknown): body is GameAnswer {
  if (body === null || typeof body !== "object") {
    return false;
  }

  return "data" in body && "profile" in body && "events" in body;
}

api.interceptors.response.use((response) => {
  const body = response.data;
  if (isGameAnswer(body)) {
    response.data = body.data;
    response.events = body.events;
    response.profile = body.profile;
  }
  return response;
});
