import axios from "axios";

export const api = axios.create({
  baseURL: "http://localhost:8080/api/",
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});
api.interceptors.response.use((response) => {
  const body = response.data;
  if (body && typeof body === "object" && "data" in body && "profile" in body) {
    response.data = body.data;
  }
  return response;
});
