import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { User } from "../model/types";
export function UserApi() {
  const { data, isLoading } = useQuery({
    queryKey: ["user"],
    queryFn: () => axios.get<User>("/api/user"),
  });

  return { data, isLoading };
}
