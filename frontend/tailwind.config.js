/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        nexa: { 50:"#eef4ff",100:"#dbe7ff",200:"#bcd2ff",300:"#8db4ff",400:"#5b8cff",500:"#3366ff",600:"#2549eb",700:"#1e3ad1",800:"#1e32a8",900:"#1e2f84",950:"#141b4d" },
      },
      fontFamily: { display: ["Sora","Inter","system-ui","sans-serif"] },
    },
  },
  plugins: [],
};
