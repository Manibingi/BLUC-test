import { createContext, useContext, useState } from 'react';
const MyContext = createContext();
export const useMyContext = () => useContext(MyContext);
export const MyProvider = ({ children }) => {
  const [interest, setMyInterest] = useState("");

  return (
    <MyContext.Provider value={{interest,setMyInterest }}>
      {children}
    </MyContext.Provider>
  );
};