// Page-scoped only: a reload offers the film again; returning home does not.
let offered = false;
export const openingWasOffered = () => offered;
export const markOpeningOffered = () => { offered = true; };
