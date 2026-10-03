// The app only constructs the official worker-backed SDK. OpenCV is already
// embedded in that worker; importing it again on the main thread adds 10 MB.
// Fail clearly if a future caller accidentally selects the main-thread path.
export default new Proxy(
  {},
  {
    get(_target, name) {
      if (name === "then") return undefined;
      throw new Error(
        "Nutrition OCR requires worker mode; OpenCV runs inside the worker.",
      );
    },
  },
);
