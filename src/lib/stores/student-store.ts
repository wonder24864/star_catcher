import { create } from "zustand";
import { persist } from "zustand/middleware";

type StudentStore = {
  selectedStudentId: string | null;
  setSelectedStudentId: (id: string) => void;
};

export const useStudentStore = create<StudentStore>()(
  persist(
    (set) => ({
      selectedStudentId: null,
      setSelectedStudentId: (id) => set({ selectedStudentId: id }),
    }),
    { name: "star-catcher-student" }
  )
);
