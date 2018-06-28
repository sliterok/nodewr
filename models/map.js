/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('map', {
    id: {
      type: DataTypes.INTEGER(6),
      allowNull: true,
      primaryKey: true,
      unique: true
    },
    code: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    uid: {
      type: DataTypes.INTEGER(11),
      allowNull: false,
      defaultValue: '13'
    },
    sp: {
      type: DataTypes.INTEGER(4),
      allowNull: true,
      defaultValue: '1'
    },
    area: {
      type: DataTypes.FLOAT(8, 8),
      allowNull: false,
      defaultValue: '1'
    }
  }, {
    tableName: 'nmap'
  });
};
