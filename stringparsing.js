var numberDelimiters = "0123456789.".split("");
var operators = ["+", "-", "/", "^", "\\times"];
var units = new Array();
var unitStrings = new Array();

initUnits();

function initUnits(){ //reads XML file and loads into units and unitStrings
    var xmlhttp=new XMLHttpRequest();
    xmlhttp.open("GET","units.xml",false);
    xmlhttp.send();
    var unitsXML = xmlhttp.responseXML;
    
    for(var i = 0; i < unitsXML.getElementsByTagName("units")[0].getElementsByTagName("unitSet").length; i++){
        var unitSet = unitsXML.getElementsByTagName("units")[0].getElementsByTagName("unitSet")[i];
        var dim = unitSet.attributes[0].nodeValue;
        dim = dim.substring(1, dim.length-1);
        dim = dim.split(", ");
        for(var j = 0; j < 7; j++){
            dim[j] = parseInt(dim[j]);
        }
        for(var j = 0; j < unitSet.childNodes.length; j++){
            var unit = unitSet.childNodes[j];
            if(unit.toString().indexOf("Text") >= 0){
                continue;
            }
            var n = unit.textContent;
            var pre = unit.attributes["prefixes"].textContent == "true";
            var def = parseFloat(unit.attributes["def"].textContent);
            units[n] = new UnitProperties(n, dim, pre, def);
        }
    }
    
    for(var unit in units){
        unitStrings.push(unit);
    }
    
    unitStrings.sort(function(a,b){return b.length - a.length});
}

function parse(str){ //returns parsed array upon completion
    
    //example str: 30.3 g H (1 mol H / 1.01 g H)
    var arr = str.split(""); //arr will be the final output
    //example arr: ["30.3", "g", "H", "(1", "mol", "H", "/", "1.01", "g", "H)"]
    for(var i = 0; i < arr.length; i++){ //separate parens, parse numbers
        if(arr[i].length == 0 || arr[i] == " "){
            arr.splice(i, 1);
            i--;
            continue;
        }
        if(arr[i] == "(" || arr[i] == ")"){
            continue;
        }
        if(arr[i] == "*"){
            arr[i] = "\\times";
        }
        if(contains(numberDelimiters, arr[i].charAt(0))){
            if(i > 0 && contains(numberDelimiters, arr[i-1].charAt(0))){
                arr[i-1] += arr[i];
                arr.splice(i, 1);
                i--;
            }
            continue;
        }
        if(!contains(operators, arr[i]) && i > 0 && !contains(numberDelimiters, arr[i-1].charAt(0)) && !contains(operators, arr[i-1]) && arr[i-1] != "(" && arr[i-1] != ")"){
            arr[i-1] += arr[i];
            arr.splice(i, 1);
            i--;
        }
    }
    
    for(var i = 0; i < arr.length; i++){//group units
        if(arr[i] == ""){
            arr.splice(i, 1);
        } else if(typeof(arr[i]) == "string"){
            for(var j = 0; j < unitStrings.length; j++){
                if(arr[i].substring(0, unitStrings[j].length) == unitStrings[j]){
                    arr.splice(i, 1, unitStrings[j], arr[i].substring(unitStrings[j].length));
                    break;
                }
            }
        }
    }
    
    //example arr: [30.3, "g", "H", "(", 1, "mol", "H", "/", 1.01, "g", "H", ")"]
    for(var i = 0; i < arr.length; i++){//convert to Units
        if(typeof(arr[i]) == "string" && arr[i] != "(" && arr[i] != ")"){
            if(contains(numberDelimiters, arr[i].charAt(0))){
                arr[i] = parseFloat(arr[i]);
            } else if(isUnit(arr[i])){
                arr[i] = new Unit(arr[i]);
                arr[i].dimensions = units[arr[i].name].dimensions;
            } else if(!contains(operators, arr[i])){
                if(arr[i-1].toString().indexOf("Unit") >= 0){
                    if(arr[i-1].modifier == ""){
                        arr[i-1].modifier = arr[i];
                        arr.splice(i, 1);
                    } else {
                        arr[i-1].modifier += "\\: " + arr[i];
                        arr.splice(i, 1);
                    }
                } else {
                    var temp = arr[i];
                    arr[i] = new Unit("");
                    arr[i].modifier = temp;
                }
            }
        }
    }
    
    for(var i = 2; i < arr.length; i++){//convert exponentiated units to multiple units
        if(typeof(arr[i]) == "number" && arr[i-1] == "^" && arr[i-2].toString().indexOf("Unit") >= 0){
            var temp = arr[i];
            var u = arr[i-2];
            arr.splice(i-2, 3);
            for(var j = 0; j < temp; j++){
                arr.splice(i-2, 0, u);
            }
            i -= 2;
        }
    }
    
    var inNumerator = true;
    for(var i = 0; i < arr.length; i++){//convert to NumberedUnits
        if(typeof(arr[i]) == "number"){
            var temp = arr[i];
            arr[i] = new NumberedUnit();
            arr[i].number = temp;
            inNumerator = true;
        } else if(arr[i].toString().indexOf("Unit") >= 0){
            if(i > 0 && arr[i-1].toString().indexOf("NumberedUnit") >= 0){
                if(inNumerator){
                    arr[i-1].numeratorUnits.push(arr[i]);
                } else {
                    arr[i-1].denominatorUnits.push(arr[i]);
                }
                arr.splice(i, 1);
                i--;
            } else if(i > 1 && arr[i-1] == "/" && arr[i-2].toString().indexOf("NumberedUnit") >= 0){
                inNumerator = false;
                arr[i-2].denominatorUnits.push(arr[i]);
                arr.splice(i-1, 2);
                i -= 2;
            } else {
                var temp = arr[i];
                arr[i] = new NumberedUnit();
                arr[i].numeratorUnits.push(temp);
                inNumerator = true;
            }
        }
    }
    
    var lPos = [];
    for(var i = 0; i < arr.length; i++){ //convert parens to arrays
        if(arr[i] == "("){
            lPos.push(i);
        } else if(arr[i] == ")"){
            if(lPos.length == 0){
                throw "ERROR: Paren mismatch.";
                return null;
            } else {
                var start = lPos.pop();
                arr.splice(start, i - start + 1, arr.slice(start+1, i));
                i = start;
            }
        } else if(arr[i].toString().indexOf("NumberedUnit") >= 0){
            arr[i].numeratorUnits.sort(usf);
            arr[i].denominatorUnits.sort(usf);
        }
    }
    if(lPos.length > 0){
        throw "ERROR: Paren mismatch.";
        return null;
    }
    //example arr: [{30.3 g H}, [{1 mol H}, "/", {1.01 g H}];
    
    return arr;
}
    
function isUnit(str){ //returns true if str is a valid unit name
    return units[str] != undefined;
}

function evaluateMath(arr){ //evaluates an already-parsed expression
    for(var i = 0; i < arr.length; i++){
        if(Array.isArray(arr[i])){
            arr[i] = evaluateMath(arr[i])[0];
        }
    }
    for(i = 1; i < arr.length-1; i++){
        if(arr[i] == "^" && arr[i-1].toString().indexOf("NumberedUnit") >= 0 && arr[i+1].toString().indexOf("NumberedUnit") >= 0){
            if(arr[i+1].numeratorUnits.length > 0 || arr[i+1].denominatorUnits.length > 0){
                GiveWarning("WARNING: Units in the exponent will be ignored.");
            }
            arr[i-1].number = Math.pow(arr[i-1].number, arr[i+1].number);
            if(arr[i+1].number % 1 != 0 && (arr[i-1].numeratorUnits.length > 0 || arr[i-1].denominatorUnits.length > 0)){
                GiveWarning("WARNING: Units in the base will be ignored due to non-integral exponent.");
                arr[i-1].numeratorUnits = new Array();
                arr[i-1].denominatorUnits = new Array();
            } else {
                var newNum = new Array();
                var newDen = new Array();
                for(var j = 0; j < arr[i+1].number; j++){
                    newNum = newNum.concat(arr[i-1].numeratorUnits);
                    newDen = newDen.concat(arr[i-1].denominatorUnits);
                }
                arr[i-1].numeratorUnits = newNum;
                arr[i+1].numeratorUnits = newDen;
            }
            arr.splice(i, 2);
            i--;
            continue;
        }
    }
    for(i = 1; i < arr.length-1; i++){
        if(arr[i] == "\\times" && arr[i-1].toString().indexOf("NumberedUnit") >= 0 && arr[i+1].toString().indexOf("NumberedUnit") >= 0){
            arr[i-1].number *= arr[i+1].number;
            for(var j = 0; j < arr[i+1].numeratorUnits.length; j++){
                arr[i-1].numeratorUnits.push(arr[i+1].numeratorUnits[j]);
            }
            for(var j = 0; j < arr[i+1].denominatorUnits.length; j++){
                arr[i-1].denominatorUnits.push(arr[i+1].denominatorUnits[j]);
            }
            arr[i-1].cancelUnits();
            arr.splice(i, 2);
            i--;
            continue;
        } else if(arr[i] == "/" && arr[i-1].toString().indexOf("NumberedUnit") >= 0 && arr[i+1].toString().indexOf("NumberedUnit") >= 0){
            arr[i-1].number /= arr[i+1].number;
            for(var j = 0; j < arr[i+1].numeratorUnits.length; j++){
                arr[i-1].denominatorUnits.push(arr[i+1].numeratorUnits[j]);
            }
            for(var j = 0; j < arr[i+1].denominatorUnits.length; j++){
                arr[i-1].numeratorUnits.push(arr[i+1].denominatorUnits[j]);
            }
            arr[i-1].cancelUnits();
            arr.splice(i, 2);
            i--;
            continue;
        }
    }
    
    for(i = 0; i < arr.length-1; i++){
        if(arr[i].toString().indexOf("NumberedUnit") >= 0 && arr[i+1].toString().indexOf("NumberedUnit") >= 0){
            arr[i].number *= arr[i+1].number;
            for(var j = 0; j < arr[i+1].numeratorUnits.length; j++){
                arr[i].numeratorUnits.push(arr[i+1].numeratorUnits[j]);
            }
            for(var j = 0; j < arr[i+1].denominatorUnits.length; j++){
                arr[i].denominatorUnits.push(arr[i+1].denominatorUnits[j]);
            }
            arr[i].cancelUnits();
            arr.splice(i+1, 1);
            i--;
        }
    }
    
    for(i = 1; i < arr.length-1; i++){
        if(arr[i] == "+" && arr[i-1].toString().indexOf("NumberedUnit") >= 0 && arr[i+1].toString().indexOf("NumberedUnit") >= 0 && arr[i-1].hasCompatableUnits(arr[i+1])){
            arr[i-1].number += arr[i+1].number;
            arr.splice(i, 2);
            i--;
            continue;
        } else if(arr[i] == "-" && arr[i-1].toString().indexOf("NumberedUnit") >= 0 && arr[i+1].toString().indexOf("NumberedUnit") >= 0){
            arr[i-1].number -= arr[i+1].number;
            arr.splice(i, 2);
            i--;
            continue;
        }
    }
    
    for(i = 0; i < arr.length; i++){
        if(arr[i].toString().indexOf("NumberedUnit") >= 0){
            arr[i].cancelUnits();
        }
    }
    
    if(arr.length != 1){
        throw "ERROR: Evaluation error.";
    }
    return arr;
}
    
function usf(a, b){//Unit Sort Function - used to sort unit names alphabetically
    return a.name.localeCompare(b.name);
}

function getLaTexString(arr){//converts a given already-parsed aray into a LaTex string
    var str = "";
    if(arr.length == 3 && arr[1] == "/" && arr[0].toString().indexOf("NumberedUnit") >= 0 && arr[2].toString().indexOf("NumberedUnit") >= 0){
        return "\\frac{" + arr[0].toLaTexString() + "}{" + arr[2].toLaTexString() + "}";
    }
    for(var i = 0; i < arr.length; i++){
        if(typeof(arr[i]) == "string" || typeof(arr[i]) == "number"){
            str += arr[i];
        } else if(arr[i] instanceof Array){
            str += "{({" + getLaTexString(arr[i]) + "})}";
        } else {
            str += arr[i].toLaTexString();
        }
    }
    return str;
}

function NumberedUnit(){ //NumberedUnit combines a number and multiple Unit objects
    this.number = 1;
    this.numeratorUnits = [];
    this.denominatorUnits = [];
    
    this.toLaTexString = function(){ //returns a LaTex string representing this NumberedUnit
        var str = "{" + this.number.toString();
        if(this.denominatorUnits.length > 0){
            str += "\\: \\mathrm{ \\frac{";
        } else if(this.numeratorUnits.length > 0){
            str += "\\: \\mathrm{";
        } else {
            return str + "}";
        }
        var i = 0;
        var cnt = 0;
        while(true){
            var unit = this.numeratorUnits[i].name;
            var mod = this.numeratorUnits[i].modifier;
            cnt = 1;
            i++;
            while(i < this.numeratorUnits.length && this.numeratorUnits[i].name == unit){
                cnt++;
                i++;
            }
            if(i >= this.numeratorUnits.length){
                str += unit;
                if(cnt != 1){
                    str += "^" + cnt
                }
                if(mod != ""){
                    str += "\\:" + mod
                }
                break;
            }
            str += unit;
            if(cnt != 1){
                str += "^" + cnt
            }
            if(mod != ""){
                str += "\\:" + mod
            }
            str += "\\: \\dot \\:";
        }
        i = 0;
        if(this.denominatorUnits.length > 0){
            str += "}{";
            while(true){
                var unit = this.denominatorUnits[i].name;
                var mod = this.denominatorUnits[i].modifier;
                cnt = 1;
                i++;
                while(i < this.denominatorUnits.length && this.denominatorUnits[i].name == unit){
                    cnt++;
                    i++;
                }
                if(i >= this.denominatorUnits.length){
                    str += unit;
                    if(cnt != 1){
                        str += "^" + cnt
                    }
                    if(mod != ""){
                        str += "\\:" + mod
                    }
                    break;
                }
                str += unit;
                if(cnt != 1){
                    str += "^" + cnt
                }
                if(mod != ""){
                    str += "\\:" + mod
                }
                str += "\\: \\dot \\:";
                str += "\\: \\dot \\:";
            }
            str += "}";
        }
        str += "}";
        return str + "}";
    }
    
    this.toString = function(){ return "[object NumberedUnit]" }; //returns a generic string
    
    this.hasCompatableUnits = function(numUnit){ //checks for unit "compatability" (i.e., addability) between two NumberedUnits
        return equals(this.getCompositeUnitDimensions(), numUnit.getCompositeUnitDimensions());
    }
        
    this.getCompositeUnitDimensions = function(){ //returns an array representing the dimensions of the unit (see below for dimension order)
        var arr = [0, 0, 0, 0, 0, 0, 0];
        for(var i = 0; i < this.numeratorUnits.length; i++){
            var unit = this.numeratorUnits[i];
            for(var j = 0; j < 7; j++){
                arr[j] += unit.dimensions[j];
            }
        }
        for(var unit in this.denominatorUnits){
            for(var i = 0; i < 7; i++){
                arr[i] -= unit.dimensions[i];
            }
        }
        return arr;
    }
    
    this.cancelUnits = function(){ //cancels out like units in the numerator and denominator
        this.denominatorUnits.sort(usf);
        this.numeratorUnits.sort(usf);
        var n = 0;
        var d = 0;
        while(n < this.numeratorUnits.length && d < this.denominatorUnits.length){
            if(usf(this.numeratorUnits[n], this.denominatorUnits[d]) == 0){
                this.numeratorUnits.splice(n, 1);
                this.denominatorUnits.splice(d, 1);
            } else if(usf(this.numeratorUnits[n], this.denominatorUnits[d]) < 0){
                n++;
            } else {
                d++;
            }
        }
    }
        
    this.getDefValue = function(){ //returns the numerical value of this NumberedUnit in terms of m, g, s, A, K, mol, and cd
        var out = this.number;
        for(var i = 0; i < this.numeratorUnits.length; i++){
            out *= units[this.numeratorUnits[i].name].definition;   
        }
        for(var i = 0; i < this.denominatorUnits.length; i++){
            out /= units[this.denominatorUnits[i].name].definition;   
        }
        return out;
    }
}

function Unit(n){ //the Unit class holds a unit, a prefix, and a modifier; for example, kg H
    this.dimensions = [0, 0, 0, 0, 0, 0, 0]; //dimension order: m, g, s, A, K, mol, cd
    this.prefix = "";//CURRENTLY UNIMPLEMENTED <<<
    this.name = n;
    this.modifier = "";
    
    this.toLaTexString = function(){ //returns a LaTex string representing this Unit
        if(this.name == "" && this.modifier == ""){
            return "";
        }
        var str = "\\mathrm{" + this.prefix + this.name;
        if(this.modifier != ""){
            str += "\\:" + this.modifier;
        }
        return str + "}";
    }
        
    this.toString = function(){ return "[object Unit]" }; //returns a generic string
}
        
function UnitProperties(n, dim, pre, def){ //holds the definitive properties of a unit - name, dimensions, whether or not it accepts prefixes, and "definition value" (see above)
    this.name = n;
    this.dimensions = dim;
    this.prefixes = pre;
    this.definition = def;
}

function contains(a, obj) { //checks if array a contains object obj
    for (var i = 0; i < a.length; i++) {
        if (a[i] === obj) {
            return true;
        }
    }
    return false;
}

function equals(arr1, arr2){ //checks if arr1 is equal to arr2
    if(arr1.length != arr2.length){
        return false;
    }
    for(var i = 0; i < arr1.length; i++){
        if(arr1[i] != arr2[i]){
            return false;
        }
    }
    return true;
}
    
function convert(number, units){ //returns a NumberedUnit that is number converted to have units given by units
    var arr = parse(units);
    if(arr.length > 1 || arr[0].toString().indexOf("NumberedUnit") < 0){
        throw "ERROR: Invalid input unit.";
    }
    if(arr[0].number != 1){
        throw "ERROR: Invalid input unit.";
    }
    if(!number.hasCompatableUnits(arr[0])){
        throw "ERROR: Incompatable units.";
    }
    
    var out = new NumberedUnit();
    out.numeratorUnits = arr[0].numeratorUnits;
    out.denominatorUnits = arr[0].denominatorUnits;
    out.number =  number.getDefValue() / arr[0].getDefValue();
    return out;
}