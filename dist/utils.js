"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.debounce = void 0;
exports.debounce = (callback, timeout = 0) => {
    let timeoutObj = null;
    return {
        run: (...args) => {
            const context = this;
            clearTimeout(timeoutObj);
            timeoutObj = setTimeout(() => callback.apply(context, args), timeout);
        },
        cancel: () => {
            clearTimeout(timeoutObj);
        },
    };
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvdXRpbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQWEsUUFBQSxRQUFRLEdBQUcsQ0FBQyxRQUFRLEVBQUUsT0FBTyxHQUFHLENBQUMsRUFBRSxFQUFFO0lBQzlDLElBQUksVUFBVSxHQUFHLElBQUksQ0FBQztJQUV0QixPQUFPO1FBQ0gsR0FBRyxFQUFFLENBQUMsR0FBRyxJQUFTLEVBQUUsRUFBRTtZQUNsQixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUM7WUFDckIsWUFBWSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQ3pCLFVBQVUsR0FBRyxVQUFVLENBQ25CLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxFQUNuQyxPQUFPLENBQ1YsQ0FBQztRQUNOLENBQUM7UUFFRCxNQUFNLEVBQUUsR0FBRyxFQUFFO1lBQ1QsWUFBWSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQzdCLENBQUM7S0FDSixDQUFDO0FBQ04sQ0FBQyxDQUFDIn0=